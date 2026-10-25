"""Bounded, stateless Riven OCR parsing; no screenshot, inventory or network access.

Input uses auto.lines_from_ocr rectangles. Results never infer rank, quality,
market value or a historical left card. Only whitelisted card blocks survive.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
import re
import unicodedata

MAX_BLOCKS = 512
MAX_TEXT = 180
MIN_CONFIDENCE = .85
_PRIVATE = re.compile(r'https?://|www\.|\b(?:session|token|authorization|bearer|cookie|password|accountid|whisper|wts|wtb)\b|[\w.+-]+@[\w.-]+', re.I)
_NUMBER = r'(?:\d+(?:[.,]\d+)?)'
_STAT = re.compile(r'^([+\-−]|[x×])\s*(' + _NUMBER + r')\s*(%|[ms](?=\s))?\s*(.+)$', re.I)
_METADATA = {
    'masteryLevel': [r'(?:\bMR|Mastery(?:\s*Rank)?|段位(?:需求|要求)?|需求段位)\s*[:：]?\s*(\d{1,3})', r'^(\d{1,3})\s*MR\b'],
    'rank': [r'(?:MOD\s*Rank|Rank|Level|等级)\s*[:：]?\s*(\d{1,2})(?:\s*/\s*8)?\b'],
    'rerolls': [r'(?:Re[- ]?rolls?|Rolls|洗练次数|洗炼次数|重构次数|重洗次数)\s*[:：]?\s*(\d{1,7})'],
}
_BOUNDS = {'masteryLevel': 100, 'rank': 8, 'rerolls': 1000000}


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if c.isalnum())


def _read(path):
    p = Path(path)
    if p.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('catalog-too-large')
    return json.loads(p.read_text(encoding='utf-8-sig'))


class CaptureCatalog:
    def __init__(self, weapons, attributes):
        self.weapons = {}
        self.weapon_aliases = {}
        self.attributes = {}
        self.attribute_aliases = {}
        if len(weapons) > 10000 or len(attributes) > 256:
            raise ValueError('catalog-too-large')
        for source in weapons:
            key, name = source.get('id'), source.get('name')
            if not isinstance(key, str) or not key.startswith('/Lotus/') or not isinstance(name, str) or len(name) > 180:
                continue
            zh = source.get('zh')
            zh = zh if isinstance(zh, str) and '\ufffd' not in zh else None
            self.weapons[key] = dict(id=key, name=name, zh=zh)
            for alias in [name, zh, *(source.get('aliases') or [])]:
                if isinstance(alias, str) and 2 <= len(alias) <= 180:
                    self.weapon_aliases.setdefault(normalized(alias), set()).add(key)
        for source in attributes:
            slug, name = source.get('slug'), source.get('name')
            if not isinstance(slug, str) or not re.fullmatch(r'[a-z0-9_/-]{1,80}', slug) or not isinstance(name, str):
                continue
            zh = source.get('zh')
            self.attributes[slug] = dict(slug=slug, name=name, nameZh=zh if isinstance(zh, str) else None)
            aliases = [name, zh, *(source.get('aliases') or [])]
            # Both independently printed labels are exact aliases of this one stat.
            aliases += [part.strip() for alias in list(aliases) if isinstance(alias, str) and '/' in alias for part in alias.split('/')]
            if slug == 'fire_rate_/_attack_speed':
                aliases += ['Fire Rate', 'Attack Speed', '射速', '攻击速度']
            if slug == 'base_damage_/_melee_damage':
                aliases += ['Damage', 'Melee Damage', '伤害', '近战伤害']
            for alias in aliases:
                if isinstance(alias, str) and normalized(alias):
                    self.attribute_aliases.setdefault(normalized(alias), set()).add(slug)

    def as_dict(self):
        weapons = [{**row, 'aliases': sorted(alias for alias, ids in self.weapon_aliases.items() if key in ids)} for key, row in self.weapons.items()]
        attributes = [{**row, 'zh': row.get('nameZh'), 'aliases': sorted(alias for alias, ids in self.attribute_aliases.items() if key in ids)} for key, row in self.attributes.items()]
        return dict(schemaVersion=1, source='local-public-riven-catalog-and-official-labels', weapons=weapons, attributes=attributes)

    @classmethod
    def from_data(cls, value):
        return cls(value.get('weapons', []), value.get('attributes', []))

    @classmethod
    def from_files(cls, riven_path, items_path=None, labels_path=None):
        raw = _read(riven_path)
        items = {x['id']: x for x in (_read(items_path).get('items', []) if items_path else [])}
        labels = {}
        if labels_path:
            p = Path(labels_path)
            if p.suffix == '.ts':
                if p.stat().st_size > 128 * 1024:
                    raise ValueError('labels-too-large')
                match = re.search(r'const labels[^=]*=\s*(\{.*?\});', p.read_text(encoding='utf-8-sig'), re.S)
                if not match:
                    raise ValueError('unsupported-labels-format')
                labels = json.loads(match.group(1))  # data only, never execute TypeScript
            else:
                labels = _read(p)
        weapons = [{**x, 'zh': items.get(x.get('id'), {}).get('zh', x.get('zh'))} for x in raw.get('weapons', [])]
        attrs = [{**x, 'zh': labels.get(x['slug'], x.get('zh'))} for x in raw.get('attributes', [])]
        return cls(weapons, attrs)


@dataclass
class Line:
    text: str
    x: float
    y: float
    w: float
    h: float
    confidence: float
    blocks: list

    @property
    def cx(self):
        return self.x + self.w / 2


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _lines(blocks, width, height):
    good, failures = [], []
    for index, block in enumerate(blocks):
        if not isinstance(block, dict):
            failures.append('invalid-block')
            continue
        text = block.get('text')
        if not isinstance(text, str) or not 1 <= len(text) <= MAX_TEXT or any(ord(c) < 32 for c in text):
            failures.append('invalid-block-text')
            continue
        values = [block.get(k) for k in ['x', 'y', 'w', 'h', 'confidence']]
        if not all(_number(v) for v in values):
            failures.append('invalid-block-bounds')
            continue
        x, y, w, h, confidence = values
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width or y + h > height or not 0 <= confidence <= 1:
            failures.append('invalid-block-bounds')
            continue
        if confidence < .7 or _PRIVATE.search(text):
            continue
        clean = dict(text=text.strip(), x=x, y=y, w=w, h=h, confidence=confidence)
        good.append(Line(text.strip(), x, y, w, h, confidence, [clean]))
    # Join nearby horizontal word boxes, never bridge the gap between two cards.
    rows = []
    for block in sorted(good, key=lambda b: (b.y + b.h / 2, b.x)):
        candidates = [row for row in rows if abs(row.y + row.h / 2 - block.y - block.h / 2) <= max(4, min(row.h, block.h) * .55) and 0 <= block.x - row.x - row.w <= max(24, width * .035)]
        if candidates:
            row = min(candidates, key=lambda row: abs(row.cx - block.cx))
            right, bottom = max(row.x + row.w, block.x + block.w), max(row.y + row.h, block.y + block.h)
            row.text += ' ' + block.text
            row.y = min(row.y, block.y)
            row.w, row.h = right - row.x, bottom - row.y
            row.confidence = min(row.confidence, block.confidence)
            row.blocks += block.blocks
        else:
            rows.append(block)
    return sorted(rows, key=lambda row: (row.y, row.x)), sorted(set(failures))


def _title(line, catalog):
    text = unicodedata.normalize('NFKC', line.text).strip()
    hits = []
    # Matching normalized prefixes tolerates OCR spacing, never fuzzy weapon substitution.
    positions = [(i, c.casefold()) for i, c in enumerate(text) if c.isalnum()]
    key = ''.join(c for _, c in positions)
    for alias, ids in catalog.weapon_aliases.items():
        if key.startswith(alias) and len(positions) >= len(alias):
            end = positions[len(alias) - 1][0] + 1
            if end < len(text) and text[end].isalnum() and text[end - 1].isascii():
                continue
            suffix = text[end:].strip(' :-–—')
            if suffix and not re.fullmatch(r'[A-Za-z][A-Za-z -]{2,79}', suffix):
                continue
            hits.append((len(alias), ids, suffix))
    if not hits:
        return None
    best = max(hits, key=lambda item: item[0])
    if len(best[1]) != 1:
        return dict(error='ambiguous-weapon')
    return dict(weaponId=next(iter(best[1])), suffix=best[2] or None)


def _attribute(line, catalog):
    text = unicodedata.normalize('NFKC', line.text).replace('−', '-').strip()
    found = _STAT.fullmatch(text)
    if not found:
        return None
    sign, digits, unit, label = found.groups()
    # Thousands separators and OCR substitutions are deliberately not guessed.
    if ',' in digits and ('.' in digits or len(digits.rsplit(',', 1)[-1]) == 3):
        return dict(error='ambiguous-number')
    value = float(digits.replace(',', '.'))
    if not math.isfinite(value) or value > 100000:
        return dict(error='invalid-stat-value')
    label = re.sub(r'\s*\(x2\s+for\s+heavy\s+attacks\)\s*$', '', label, flags=re.I)
    ids = catalog.attribute_aliases.get(normalized(label), set())
    if len(ids) != 1:
        return dict(error='unknown-stat' if not ids else 'ambiguous-stat')
    slug = next(iter(ids))
    signed = -value if sign == '-' else value
    return {**catalog.attributes[slug], 'value': value, 'signedValue': signed, 'printedSign': '×' if sign.lower() == 'x' or sign == '×' else sign, 'unit': 'x' if sign.lower() == 'x' or sign == '×' else unit or '', 'rawText': line.text, 'confidence': line.confidence}


def _card(anchor, title, rows, anchors, catalog, width, height):
    nearby, used, attrs, warnings = [], list(anchor.blocks), [], []
    for line in rows:
        if line is anchor or line.y < anchor.y + anchor.h * .6 or line.y > anchor.y + height * .62:
            continue
        if abs(line.cx - anchor.cx) > width * .18:
            continue
        # Each same-frame column owns its own evidence; no cross-card borrowing.
        other = [a for a, _ in anchors if a is not anchor and abs(a.cx - line.cx) + width * .02 < abs(anchor.cx - line.cx) and abs(a.y - anchor.y) < height * .12]
        if other:
            continue
        if any(a is not anchor and abs(a.cx - anchor.cx) < width * .12 and anchor.y < a.y <= line.y for a, _ in anchors):
            continue
        nearby.append(line)
    stat_end = max((line.y + line.h for line in nearby if (parsed := _attribute(line, catalog)) and 'error' not in parsed), default=anchor.y + anchor.h)
    metadata = {key: [] for key in _METADATA}
    suffix = title['suffix']
    for line in nearby:
        attribute = _attribute(line, catalog)
        if attribute:
            if line.confidence < MIN_CONFIDENCE:
                warnings.append('low-confidence-stat')
            elif 'error' in attribute:
                warnings.append(attribute['error'])
            else:
                attrs.append(attribute)
                used += line.blocks
            continue
        all_patterns = [pattern for patterns in _METADATA.values() for pattern in patterns]
        remainder = unicodedata.normalize('NFKC', line.text)
        for pattern in all_patterns:
            remainder = re.sub(pattern, '', remainder, flags=re.I)
        trusted_metadata = not remainder.strip(' :;|·,-/') and line.y <= stat_end + max(40, min(height * .15, 150))
        for key, patterns in _METADATA.items():
            matches = [m for pattern in patterns for m in re.finditer(pattern, unicodedata.normalize('NFKC', line.text), re.I)]
            if matches:
                if not trusted_metadata:
                    warnings.append('untrusted-metadata-context')
                    continue
                if line.confidence < MIN_CONFIDENCE:
                    warnings.append('low-confidence-' + key)
                    continue
                for match in matches:
                    n = int(match.group(1))
                    if n <= _BOUNDS[key]:
                        metadata[key].append(n)
                        used += line.blocks
                    else:
                        warnings.append('invalid-' + key)
        if suffix is None and line.y <= anchor.y + anchor.h * 3 and abs(line.cx - anchor.cx) < width * .08 and re.fullmatch(r'[A-Za-z][A-Za-z-]{3,79}', line.text):
            suffix = line.text
            used += line.blocks
    unique = {}
    for attr in attrs:
        previous = unique.get(attr['slug'])
        if previous and (previous['signedValue'], previous['unit']) != (attr['signedValue'], attr['unit']):
            return None, ['conflicting-stat-values']
        unique.setdefault(attr['slug'], attr)
    if not 2 <= len(unique) <= 4:
        return None, ['insufficient-stats' if len(unique) < 2 else 'too-many-stats'] + warnings
    for key, values in metadata.items():
        if len(set(values)) > 1:
            warnings.append('ambiguous-' + key)
    # Only recognized card-local title/stat/explicit metadata words are retained.
    used = list({(b['x'], b['y'], b['w'], b['h'], b['text']): b for b in used}.values())[:32]
    left, top = min(b['x'] for b in used), min(b['y'] for b in used)
    right, bottom = max(b['x'] + b['w'] for b in used), max(b['y'] + b['h'] for b in used)
    if right - left > width * .48 or bottom - top > height * .72:
        return None, ['card-bounds-too-wide']
    weapon = catalog.weapons[title['weaponId']]
    card = dict(side='single', weaponId=weapon['id'], weaponName=weapon['name'], weaponNameZh=weapon['zh'], rivenName=suffix, attributes=list(unique.values()), bounds=[left, top, right - left, bottom - top], confidence=min([anchor.confidence] + [a['confidence'] for a in unique.values()]), warnings=sorted(set(warnings)), rawBlocks=sorted(used, key=lambda b: (b['y'], b['x'])))
    card.update({key: values[0] if values and len(set(values)) == 1 else None for key, values in metadata.items()})
    return card, []


def parse_capture(blocks, width, height, catalog, mode_hint=None, synthetic=False):
    """Return diagnostics plus an emit-ready event only for a defensible card.

    `mode_hint='reroll'` must come from the caller's current UI/log observation.
    Missing hints never create a historical left-hand card from inventory.
    """
    failures = []
    if not _number(width) or not _number(height) or not 100 <= width <= 16384 or not 100 <= height <= 16384:
        return dict(event=None, reasons=['invalid-frame-size'])
    if not isinstance(blocks, list) or len(blocks) > MAX_BLOCKS:
        return dict(event=None, reasons=['too-many-blocks'])
    rows, failures = _lines(blocks, width, height)
    anchors = []
    for row in rows:
        title = _title(row, catalog) if row.confidence >= MIN_CONFIDENCE else None
        if title and 'error' in title:
            failures.append(title['error'])
        elif title:
            # A separately printed translated heading does not become a second card.
            if any(t['weaponId'] == title['weaponId'] and abs(a.cx - row.cx) < width * .07 and abs(a.y - row.y) < height * .055 for a, t in anchors):
                continue
            anchors.append((row, title))
    if len(anchors) > 8:
        return dict(event=None, reasons=['too-many-card-candidates'])
    cards = []
    for anchor, title in anchors:
        card, errors = _card(anchor, title, rows, anchors, catalog, width, height)
        failures += errors
        if card:
            cards.append(card)
    if not cards:
        return dict(event=None, reasons=sorted(set(failures or ['no-valid-riven-card'])))
    cards.sort(key=lambda card: card['bounds'][0] + card['bounds'][2] / 2)
    mode, proof = 'unknown', None
    hint = mode_hint if mode_hint in ['reroll', 'riven-reroll', 'comparison', 'chat', 'chat-riven'] else None
    markers = {normalized(row.text): row for row in rows if row.confidence >= MIN_CONFIDENCE}
    keep = next((markers[key] for key in ['keep', '保留', '保留旧属性'] if key in markers), None)
    accept = next((markers[key] for key in ['accept', '接受', '接受新属性'] if key in markers), None)
    if len(cards) == 2 and cards[0]['weaponId'] == cards[1]['weaponId']:
        left, right = cards
        separate = left['bounds'][0] + left['bounds'][2] <= right['bounds'][0] and right['bounds'][0] - left['bounds'][0] >= width * .12
        buttons = bool(keep and accept and keep.cx < accept.cx and keep.y >= left['bounds'][1] and accept.y >= right['bounds'][1])
        if separate and (hint in ['reroll', 'riven-reroll', 'comparison'] or buttons):
            mode, proof = 'comparison', 'explicit-hint' if hint else 'ui-anchors'
            left['side'], right['side'] = 'left', 'right'
    if mode != 'comparison':
        if len(cards) > 1:
            failures.append('multiple-cards-mode-unconfirmed')
            cards = [max(cards, key=lambda card: card['confidence'])]
        mode = 'single' if hint in ['chat', 'chat-riven', 'reroll', 'riven-reroll', 'comparison'] else 'unknown'
        if hint in ['reroll', 'riven-reroll', 'comparison']:
            failures.append('comparison-pair-incomplete')
    event = dict(schemaVersion=1, type='riven-capture', mode=mode, comparisonEvidence=proof, evidence='synthetic-ocr' if synthetic else 'ocr', frameSize=[width, height], cards=cards, warnings=sorted(set(failures)))
    return dict(event=event, reasons=[])


def capture_events(blocks, width, height, catalog, mode_hint=None, synthetic=False):
    event = parse_capture(blocks, width, height, catalog, mode_hint, synthetic)['event']
    return [event] if event else []


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--riven-catalog', required=True)
    parser.add_argument('--items-catalog')
    parser.add_argument('--labels')
    parser.add_argument('--write-catalog', help='Write only public recognition IDs and labels')
    parser.add_argument('--input', help='Existing JSON array of OCR rectangles; no image capture')
    parser.add_argument('--width', type=int, default=1920)
    parser.add_argument('--height', type=int, default=1080)
    parser.add_argument('--mode', choices=['chat', 'reroll'])
    parser.add_argument('--synthetic', action='store_true')
    args = parser.parse_args()
    catalog = CaptureCatalog.from_files(args.riven_catalog, args.items_catalog, args.labels)
    if args.write_catalog:
        Path(args.write_catalog).write_text(json.dumps(catalog.as_dict(), ensure_ascii=False, indent=2), encoding='utf-8')
    if args.input:
        print(json.dumps(parse_capture(_read(args.input), args.width, args.height, catalog, args.mode, args.synthetic), ensure_ascii=True))
