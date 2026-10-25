import unittest
from trade_chat import candidates
class TradeChatTests(unittest.TestCase):
    def test_bilingual(self):
        for text in ['Hi! I want to buy [Ash Prime Set] for 45 platinum.', '我想购买【灰烬 Prime 一套】，45 白金']:
            row=candidates(text)[0]
            self.assertEqual(row['platinum'],45)
            self.assertEqual(row['status'],'pending')
    def test_not_completion(self):
        self.assertEqual(candidates('Trade completed 45'),[])
    def test_stable(self):
        text='want to sell [Ash] for 15 platinum'
        self.assertEqual(candidates(text),candidates(text))
