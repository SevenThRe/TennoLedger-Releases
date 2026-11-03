"""Audit native WM SQLite evidence; a successful HTTP call alone is not acceptance."""
import argparse, json, sqlite3, time
from pathlib import Path

ALGORITHM = 'median-online-sell-v1'
EXEMPT = {
 '/Lotus/Types/Recipes/Components/FormaBlueprint',
 '/Lotus/Types/Recipes/Components/WeaponUtilityUnlockerBlueprint',
 '/Lotus/Types/Items/MiscItems/Kuva',
 '/Lotus/Types/Items/MiscItems/RivenFragment',
}

def audit(db, catalog, now, min_successes=2):
    rewards = {r['id']:r for relic in catalog['items'] for r in relic['rewards']}
    expected = {r['marketSlug'] for r in rewards.values() if r.get('marketSlug')}
    unexpected = sorted(k for k,r in rewards.items() if not r.get('marketSlug') and k not in EXEMPT)
    records = {r['slug']:dict(r) for r in db.execute("SELECT * FROM price_quotes WHERE platform='pc'")}
    history_exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='price_observations'").fetchone()
    history = {}
    if history_exists:
        for row in db.execute("SELECT * FROM price_observations WHERE platform='pc' ORDER BY attempted"):
            history.setdefault(row['slug'],[]).append(dict(row))
    rows=[]
    for slug in sorted(expected):
        row=records.get(slug,{}); quote=json.loads(row.get('quote') or '{}')
        age=now-row['fetched'] if row.get('fetched') else None
        successes=[r for r in history.get(slug,[]) if r['error'] is None and r['algorithm']==ALGORITHM]
        gaps=[b['attempted']-a['attempted'] for a,b in zip(successes,successes[1:])]
        samples=quote.get('samples') or []; units=sorted(s['unitPrice'] for s in samples)
        median=(units[len(units)//2] if len(units)%2 else sum(units[len(units)//2-1:len(units)//2+1])/2) if units else None
        evidence_ok=quote.get('algorithm')==ALGORITHM and quote.get('sampleCount')==len(samples) and len(samples)<=5 and len({s['sellerId'] for s in samples})==len(samples) and all(s['status'] in ('online','ingame') and abs(s['unitPrice']-s['platinum']/s['perTrade'])<1e-8 for s in samples) and (quote.get('price') is None if median is None else abs(quote.get('price',-1)-median)<=0.005001)
        fresh=age is not None and 0<=age<=900 and not row.get('error')
        cycles=len(successes)>=min_successes and all(g<=900 for g in gaps)
        rows.append(dict(slug=slug,price=quote.get('price'),ageSeconds=age,error=row.get('error'),fresh=fresh,evidence=evidence_ok,successes=len(successes),maximumGapSeconds=max(gaps,default=None),cyclesPassed=cycles))
    return dict(algorithm=ALGORITHM,observedAt=now,required=len(expected),exempt=sorted(EXEMPT & rewards.keys()),unexpectedUnmapped=unexpected,fresh=sum(r['fresh'] for r in rows),priced=sum(r['price'] is not None for r in rows),evidenceValid=sum(r['evidence'] for r in rows),cyclesPassed=sum(r['cyclesPassed'] for r in rows),minimumSuccesses=min_successes,passed=bool(rows) and not unexpected and all(r['fresh'] and r['evidence'] and r['cyclesPassed'] and r['price'] is not None for r in rows),rows=rows)

def main():
    p=argparse.ArgumentParser();p.add_argument('--db',type=Path,required=True);p.add_argument('--catalog',type=Path,default=Path('desktop/public/relic-catalog.json'));p.add_argument('--output',type=Path,required=True);p.add_argument('--min-successes',type=int,default=2);a=p.parse_args()
    if a.min_successes<1:p.error('--min-successes must be positive')
    db=sqlite3.connect(a.db.resolve().as_uri()+'?mode=ro',uri=True);db.row_factory=sqlite3.Row
    result=audit(db,json.loads(a.catalog.read_text(encoding='utf-8')),time.time(),a.min_successes)
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=False));return 0 if result['passed'] else 1

if __name__=='__main__':raise SystemExit(main())
