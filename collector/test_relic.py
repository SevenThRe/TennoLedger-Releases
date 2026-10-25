import unittest
from relic import match_item, normalize

class MatchingTests(unittest.TestCase):
    def test_multilingual_stable_id(self):
        catalog = [{'id':'test-item', 'names':{'zh-CN':['测试 Prime 蓝图'], 'en':['Test Prime Blueprint']}}]
        self.assertEqual(match_item('测试 PRIME 蓝图', catalog)['itemId'], 'test-item')
        self.assertEqual(match_item('Test Prime Blueprint', catalog)['itemId'], 'test-item')
    def test_ambiguous_and_unknown(self):
        catalog = [{'id':x,'names':{'en':['same name']}} for x in ['a','b']]
        self.assertIsNone(match_item('same name', catalog)['itemId'])
        self.assertIsNone(match_item('', catalog)['itemId'])
        self.assertIsNone(match_item('unrelated', catalog)['itemId'])
    def test_unicode(self):
        self.assertEqual(normalize('ＰＲＩＭＥ 蓝图'), 'prime蓝图')

if __name__ == '__main__':
    unittest.main()
