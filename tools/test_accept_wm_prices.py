import json,sqlite3,unittest
from accept_wm_prices import audit,ALGORITHM
class AcceptanceTests(unittest.TestCase):
 def run_audit(self, history=(100,700), error=None, fetched=700, price=5):
  db=sqlite3.connect(':memory:');db.row_factory=sqlite3.Row
  db.executescript('CREATE TABLE price_quotes(slug,platform,fetched,quote,error); CREATE TABLE price_observations(slug,platform,attempted,price,sample_count,error,algorithm);')
  q={'price':price,'sampleCount':1,'algorithm':ALGORITHM,'samples':[{'sellerId':'seller','unitPrice':5,'platinum':10,'perTrade':2,'status':'online'}]}
  if price is None:q.update(sampleCount=0,samples=[])
  db.execute('INSERT INTO price_quotes VALUES(?,?,?,?,?)',('part','pc',fetched,json.dumps(q),error))
  for t in history:db.execute('INSERT INTO price_observations VALUES(?,?,?,?,?,?,?)',('part','pc',t,5,1,None,ALGORITHM))
  return audit(db,{'items':[{'rewards':[{'id':'part-id','marketSlug':'part'}]}]},800)
 def test_real_repeated_observations_and_sample_evidence_are_required(self):
  self.assertTrue(self.run_audit()['passed'])
  for kwargs in ({'history':(700,)},{'error':'timeout'},{'price':999},{'price':None},{'fetched':-200},{'history':(-201,700)}):
   self.assertFalse(self.run_audit(**kwargs)['passed'],kwargs)
if __name__=='__main__':unittest.main()
