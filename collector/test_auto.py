import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from auto import reward_screen_closed, Tail, Signals, Aliases, reward_cards, inventory_observations, Confirmation, CaptureRecord, relic_selection_era, RelicSelectionSession


def line(text,x=100,y=300,w=100,h=20):
    return dict(text=text,x=x,y=y,w=w,h=h,confidence=.99)

class AutoTests(unittest.TestCase):
    def test_game_chinese_century_labels_and_reentry_heartbeat(self):
        for text,era in [('古世纪','Lith'),('前世纪','Meso'),('中世纪','Neo'),('后世纪','Axi')]:
            self.assertEqual(relic_selection_era([line(text,x=25,y=70,w=120)],1000,1000),era)
        session=RelicSelectionSession()
        first=session.observe('Meso',0)
        self.assertEqual(first[0],'relic-selection')
        self.assertIsNone(session.observe('Meso',3))
        heartbeat=session.observe('Meso',12)
        self.assertEqual(heartbeat[1]['selectionSession'],first[1]['selectionSession'])
        self.assertEqual(session.observe('Axi',13)[1]['era'],'Axi')
        self.assertIsNone(session.observe(None,16))
        self.assertEqual(session.observe(None,19)[0],'relic-selection-ended')
        second=session.observe('Meso',22)
        self.assertNotEqual(second[1]['selectionSession'],first[1]['selectionSession'])

    def test_selection_tier_requires_one_confident_title_not_reward_grid(self):
        self.assertEqual(relic_selection_era([line('古纪 遗物',x=25,y=70,w=120)],1000,1000),'Lith')
        self.assertEqual(relic_selection_era([line('AXI RELICS',x=25,y=70,w=120)],1000,1000),'Axi')
        self.assertIsNone(relic_selection_era([line('Lith L1',x=300,y=400)],1000,1000))
        self.assertIsNone(relic_selection_era([line('Lith',x=20,y=30,w=50),line('Axi',x=20,y=70,w=50)],1000,1000))
        low=line('Lith',x=20,y=30,w=50);low['confidence']=.6
        self.assertIsNone(relic_selection_era([low],1000,1000))

    def test_capture_protocol_binds_results_and_always_closes_after_failure(self):
        events=[]
        with patch('auto.emit',side_effect=lambda kind,**fields:events.append((kind,fields))):
            with CaptureRecord() as capture:
                capture.emit('trade-candidate',capturedAt='later',candidate={})
                capture.emit('relic',capturedAt='later',cards=[])
            with self.assertRaises(RuntimeError):
                with CaptureRecord() as failed:
                    raise RuntimeError('synthetic')
        self.assertEqual([kind for kind,_ in events],['capture-start','trade-candidate','relic','capture-end','capture-start','capture-end'])
        first=events[0][1]['captureId']
        self.assertTrue(events[0][1]['startedAt'])
        self.assertTrue(all(fields['captureId']==first for _,fields in events[:4]))
        self.assertNotEqual(first,events[4][1]['captureId'])
        self.assertEqual(events[4][1]['captureId'],events[5][1]['captureId'])

    def test_tail_skips_history_chunked_and_rotation(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root)/'EE.log'
            path.write_bytes(b'old\n')
            tail = Tail(path)
            self.assertEqual(tail.poll(), [])
            with path.open('ab') as out: out.write(b'new')
            self.assertEqual(tail.poll(), [])
            with path.open('ab') as out: out.write(b' record\n')
            self.assertEqual(tail.poll(), ['new record'])
            path.write_bytes(b'fresh\n')
            self.assertEqual(tail.poll(), ['fresh'])
            path.rename(Path(root)/'old.log')
            path.write_bytes(b'replaced\n')
            self.assertEqual(tail.poll(), ['replaced'])

    def test_tail_bounded(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'EE.log';path.write_bytes(b'')
            tail=Tail(path);tail.poll()
            path.write_bytes(b'a'*70000)
            self.assertEqual(tail.poll(), [])
            with path.open('ab') as out: out.write(b'end\nvalid\n')
            self.assertEqual(tail.poll(), ['valid'])

    def test_replay_and_signals(self):
        with tempfile.TemporaryDirectory() as root:
            path=Path(root)/'EE.log';path.write_bytes(b'Got rewards\n')
            self.assertEqual(Tail(path,True).poll(), ['Got rewards'])
        signals=Signals()
        self.assertTrue(signals.accept('Script [Info]: Got rewards'))
        signals.accept('activeMissionTag=VoidT5')
        self.assertFalse(signals.accept('Got rewards'))
        signals.accept('"activeMissionTag" : "VoidT4"')
        self.assertTrue(signals.accept('Got rewards'))

    def test_wrapped_rewards_and_ambiguous_aliases(self):
        aliases=Aliases([dict(id='a',name='Gunsen Prime Handle'),dict(id='b',name='Forma Blueprint')])
        cards=reward_cards([line('Gunsen Prime'),line('Handle',y=325),line('Forma Blueprint',x=600)],aliases,1000,1000)
        self.assertEqual([c['itemId'] for c in cards],['a','b'])
        aliases=Aliases([dict(id='a',name='Same'),dict(id='b',name='Same')])
        self.assertEqual(reward_cards([line('Same')],aliases,1000,1000),[])

    def test_reward_screen_close_uses_actual_log_markers(self):
        self.assertTrue(reward_screen_closed('8608.474 Script [Info]: ProjectionRewardChoice.lua: Relic reward screen shut down'))
        self.assertTrue(reward_screen_closed('ProjectionRewardChoice.lua: Reward choice force closed'))
        self.assertFalse(reward_screen_closed('ProjectionsCountdown.lua: Relic timer closed'))
        self.assertFalse(reward_screen_closed('ProjectionRewardChoice.lua: Relic rewards initialized'))

    def test_reward_columns_preserve_unknown_and_wrapped_prime_blueprints(self):
        aliases=Aliases([dict(id='frame',name='Test Prime',zh='Test Prime',recipe={'parts':[{'itemId':'bp'}]}),dict(id='bp',name='Blueprint'),dict(id='neuro',name='Test Prime Neuroptics Blueprint',zh='Test Prime 头部神经光元 蓝图'),dict(id='pet',name='铁甲狐帕菲拉')])
        rows=[line('Test Prime 蓝图',x=50,y=430),line('Test Prime 头部神经',x=500,y=416,w=200,h=31),line('光元蓝图',x=545,y=445,w=110,h=34),line('Unknown Prime 蓝图',x=800,y=430),line('铁甲狐帕菲拉',x=50,y=300)]
        cards=reward_cards(rows,aliases,1000,1000,menu_scale={'mode':'full','percent':100})
        self.assertEqual([c['itemId'] for c in cards],['bp','neuro',None])
        self.assertEqual(reward_cards([line('铁甲狐帕菲拉')],aliases,1000,1000),[])

    def test_inventory_requires_heading_exact_name_and_explicit_count(self):
        aliases=Aliases([dict(id='a',name='Forma')])
        values=[line('INVENTORY',y=50),line('Forma'),line('x12',y=270)]
        self.assertEqual(inventory_observations(values,aliases,1000,1000),[dict(itemId='a',quantity=12)])
        self.assertEqual(inventory_observations(values[1:],aliases,1000,1000),[])
        self.assertEqual(inventory_observations(values[:2],aliases,1000,1000),[])
        self.assertEqual(inventory_observations([values[0],line('F0rma'),values[2]],aliases,1000,1000),[])

    def test_inventory_rejects_crosscard_quantity(self):
        aliases=Aliases([dict(id='a',name='Forma'),dict(id='b',name='Ferrite')])
        values=[line('INVENTORY',y=50),line('Forma'),line('Ferrite',y=330),line('x12',y=290)]
        self.assertEqual(inventory_observations(values,aliases,1000,1000),[])

    def test_full_parent_alias_and_created_fallback(self):
        aliases=Aliases([dict(id='a',name='Gunsen Prime',recipe={'parts':[{'itemId':'b'}]}),dict(id='b',name='Handle')])
        self.assertEqual(aliases.exact('Gunsen Prime Handle'),'b')
        signals=Signals()
        self.assertTrue(signals.accept('1167.854 Sys [Info]: Created /Lotus/Interface/ProjectionRewardChoice.swf'))
        signals.accept('activeMissionTag=VoidT5')
        self.assertFalse(signals.accept('Created /Lotus/Interface/ProjectionRewardChoice.swf'))

    def test_confirmation_requires_two_frames_and_deduplicates(self):
        confirm=Confirmation();obs=[dict(itemId='a',quantity=2)]
        self.assertFalse(confirm.accept(obs));self.assertTrue(confirm.accept(obs))
        self.assertFalse(confirm.accept(obs));self.assertFalse(confirm.accept([]))
        self.assertFalse(confirm.accept(obs));self.assertFalse(confirm.accept(obs))
        changed=[dict(itemId='a',quantity=3)]
        self.assertFalse(confirm.accept(changed));self.assertTrue(confirm.accept(changed))

if __name__=='__main__': unittest.main()
