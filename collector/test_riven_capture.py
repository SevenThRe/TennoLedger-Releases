"""Synthetic OCR geometry only; these tests do not establish game recognition."""
import json
from pathlib import Path
import tempfile
import unittest
from riven_capture import CaptureCatalog, parse_capture, capture_events

TORID = '/Lotus/Weapons/ClanTech/Bio/BioWeapon'
AMPREX = '/Lotus/Weapons/Corpus/LongGuns/ChainLightningGun/ChainLightningRifle'


def catalog():
    return CaptureCatalog([
        dict(id=TORID, name='Torid', zh='托里德'),
        dict(id=AMPREX, name='Amprex', zh='安培克斯'),
    ], [
        dict(slug='base_damage_/_melee_damage', name='Damage', zh='伤害'),
        dict(slug='critical_chance', name='Critical Chance', zh='暴击几率'),
        dict(slug='zoom', name='Zoom', zh='变焦'),
        dict(slug='multishot', name='Multishot', zh='多重射击'),
    ])


def block(text, x=200, y=100, w=250, h=24, confidence=.98):
    return dict(text=text, x=x, y=y, w=w, h=h, confidence=confidence)


def card(x=200, chinese=False, name='Torid', damage=100):
    return [block(('托里德' if chinese else name) + ' Visi-crita', x, 100),
            block(f'+{damage}% ' + ('伤害' if chinese else 'Damage'), x, 180),
            block('+75.5% ' + ('暴击几率' if chinese else 'Critical Chance'), x, 220),
            block('−20.2% ' + ('变焦' if chinese else 'Zoom'), x, 260),
            block('MR: 12', x, 310, 120), block('Rank 8/8', x, 350, 120),
            block('Rerolls: 4', x, 390, 120)]


class RivenCaptureTests(unittest.TestCase):
    def test_bilingual_card_keeps_printed_values_and_explicit_metadata(self):
        for chinese in [False, True]:
            event = capture_events(card(chinese=chinese), 1600, 900, catalog(), 'chat', True)[0]
            self.assertEqual(event['evidence'], 'synthetic-ocr')
            self.assertEqual(event['mode'], 'single')
            item = event['cards'][0]
            self.assertEqual(item['weaponId'], TORID)
            self.assertEqual(item['weaponNameZh'], '托里德')
            self.assertEqual(item['rivenName'], 'Visi-crita')
            self.assertEqual([item[k] for k in ['masteryLevel', 'rank', 'rerolls']], [12, 8, 4])
            self.assertEqual(item['attributes'][2]['signedValue'], -20.2)
            self.assertNotIn('grade', item)
            self.assertNotIn('perfectness', item)

    def test_unknown_metadata_stays_null_without_zero_defaults_or_rank_inference(self):
        event = capture_events(card()[:4], 1600, 900, catalog(), synthetic=True)[0]
        item = event['cards'][0]
        self.assertEqual(event['mode'], 'unknown')
        self.assertIsNone(item['rank'])
        self.assertIsNone(item['masteryLevel'])
        self.assertIsNone(item['rerolls'])

    def test_same_frame_two_cards_compare_by_position_never_input_order(self):
        words = list(reversed(card(950, damage=145) + card(200)))
        event = capture_events(words, 1600, 900, catalog(), 'reroll', True)[0]
        self.assertEqual(event['mode'], 'comparison')
        self.assertEqual(event['comparisonEvidence'], 'explicit-hint')
        left, right = event['cards']
        self.assertEqual([left['side'], right['side']], ['left', 'right'])
        self.assertEqual(left['attributes'][0]['signedValue'], 100)
        self.assertEqual(right['attributes'][0]['signedValue'], 145)
        self.assertLess(left['bounds'][0], right['bounds'][0])

    def test_ui_anchors_are_required_without_a_current_reroll_hint(self):
        words = card(200) + card(950)
        event = capture_events(words, 1600, 900, catalog(), synthetic=True)[0]
        self.assertEqual(event['mode'], 'unknown')
        self.assertEqual(len(event['cards']), 1)
        self.assertIn('multiple-cards-mode-unconfirmed', event['warnings'])
        event = capture_events(words + [block('KEEP', 260, 500, 90), block('ACCEPT', 1020, 500, 90)], 1600, 900, catalog(), synthetic=True)[0]
        self.assertEqual(event['mode'], 'comparison')
        self.assertEqual(event['comparisonEvidence'], 'ui-anchors')

    def test_single_or_different_weapon_never_borrows_a_previous_card(self):
        first = capture_events(card(200) + card(950), 1600, 900, catalog(), 'reroll', True)[0]
        self.assertEqual(len(first['cards']), 2)
        second = capture_events(card(950), 1600, 900, catalog(), 'reroll', True)[0]
        self.assertEqual(second['mode'], 'single')
        self.assertEqual(len(second['cards']), 1)
        self.assertIn('comparison-pair-incomplete', second['warnings'])
        different = capture_events(card(200) + card(950, name='Amprex'), 1600, 900, catalog(), 'reroll', True)[0]
        self.assertNotEqual(different['mode'], 'comparison')

    def test_word_boxes_decimal_comma_and_low_confidence_are_bounded(self):
        words = [block('Torid Visi-crita'), block('+98,5%', 200, 180, 80), block('Multishot', 290, 180, 130), block('+75.5% Critical Chance', 200, 220)]
        event = capture_events(words, 1600, 900, catalog(), 'chat', True)[0]
        self.assertEqual(event['cards'][0]['attributes'][0]['signedValue'], 98.5)
        words[2]['confidence'] = .72
        self.assertEqual(capture_events(words, 1600, 900, catalog()), [])

    def test_privacy_keeps_only_card_words_not_surrounding_chat_or_credentials(self):
        words = card() + [block('User123 WTS session token PRIVATE', 100, 600, 350), block('https://example.test/private', 200, 440, 300), block('MR 20 username@example.test', 200, 430, 300)]
        event = capture_events(words, 1600, 900, catalog(), 'chat', True)[0]
        encoded = json.dumps(event)
        self.assertNotIn('PRIVATE', encoded)
        self.assertNotIn('example.test', encoded)
        self.assertNotIn('User123', encoded)
        self.assertEqual(event['cards'][0]['masteryLevel'], 12)
        self.assertTrue(all(b['y'] < 430 for b in event['cards'][0]['rawBlocks']))

    def test_ambiguity_malformed_bounds_and_oversized_inputs_never_emit(self):
        self.assertEqual(capture_events([block('Torid Visi-crita')] * 513, 1600, 900, catalog()), [])
        self.assertEqual(capture_events(card(), float('nan'), 900, catalog()), [])
        ambiguous = CaptureCatalog([dict(id=TORID, name='Same'), dict(id=AMPREX, name='Same')], [dict(slug='damage', name='Damage'), dict(slug='zoom', name='Zoom')])
        self.assertEqual(capture_events([block('Same Crita'), block('+100% Damage', y=180), block('-10% Zoom', y=220)], 1600, 900, ambiguous), [])
        words = card()[:4] + [block('+150% Damage', y=280)]
        self.assertEqual(capture_events(words, 1600, 900, catalog()), [])
        words = card()[:4]
        words[0]['x'] = -1
        self.assertEqual(capture_events(words, 1600, 900, catalog()), [])

    def test_public_catalog_export_is_self_contained_and_has_no_inventory_fields(self):
        root = Path(__file__).resolve().parents[1]
        actual = CaptureCatalog.from_files(root/'desktop/public/riven-catalog.json', root/'desktop/public/catalog.json', root/'desktop/src/rivenLocalization.ts')
        data = actual.as_dict()
        self.assertGreater(len(data['weapons']), 400)
        torid = next(w for w in data['weapons'] if w['id'] == TORID)
        self.assertEqual(torid['zh'], '托里德')
        self.assertNotIn('goodRolls', torid)
        self.assertNotIn('omegaAtt', torid)
        self.assertNotIn('counts', data)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'recognition.json'
            path.write_text(json.dumps(data), encoding='utf-8')
            restored = CaptureCatalog.from_files(path)
            result = capture_events(card(chinese=True), 1600, 900, restored, 'chat', True)[0]
            self.assertEqual(result['cards'][0]['weaponId'], TORID)


if __name__ == '__main__':
    unittest.main()
