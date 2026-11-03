//! Public, account-independent price engine. No network operation holds the DB lock.
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
pub const ALGORITHM: &str = "median-online-sell-v1";
pub const SOURCE: &str = "warframe.market / median-online-sell-v1";
fn now() -> i64 {
    chrono::Utc::now().timestamp()
}
fn stamp(t: i64) -> String {
    chrono::DateTime::from_timestamp(t, 0).unwrap().to_rfc3339()
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

// Explicit base variant: unranked, intact requiem mods, empty stars, no subtype.
// Other variants stay in the existing interactive order composer, never pollute base valuations.
pub fn calculate(data: &Value) -> Result<Value, String> {
    let orders = data.as_array().ok_or("Invalid WM orders array")?;
    let mut sell: BTreeMap<String, (f64, Value)> = BTreeMap::new();
    let mut buy: Vec<f64> = vec![];
    for o in orders {
        if o["visible"].as_bool() != Some(true)
            || !matches!(o["user"]["status"].as_str(), Some("online" | "ingame"))
        {
            continue;
        }
        if o.get("rank")
            .is_some_and(|r| !r.is_null() && r.as_u64() != Some(0))
            || ["amberStars", "cyanStars"].iter().any(|k| {
                o.get(*k)
                    .is_some_and(|v| !v.is_null() && v.as_u64() != Some(0))
            })
        {
            continue;
        }
        if o.get("subtype").is_some_and(|v| !v.is_null())
            || o.get("charges")
                .is_some_and(|v| !v.is_null() && v.as_u64() != Some(3))
        {
            continue;
        }
        let Some(qty) = o["quantity"].as_u64().filter(|v| *v > 0) else {
            continue;
        };
        let pack = match o.get("perTrade") {
            None | Some(Value::Null) => 1,
            Some(v) => match v.as_u64() {
                Some(n) => n,
                None => continue,
            },
        };
        if pack == 0 || pack > qty {
            continue;
        }
        let Some(p) = o["platinum"]
            .as_f64()
            .filter(|p| p.is_finite() && *p > 0. && *p <= 900000.)
        else {
            continue;
        };
        let unit = p / pack as f64;
        let Some(seller) = o["user"]["id"].as_str().filter(|s| !s.is_empty()) else {
            continue;
        };
        if o["type"] == "buy" {
            buy.push(unit);
        } else if o["type"] == "sell" {
            let evidence = json!({"sellerId":seller,"orderId":o["id"],"unitPrice":unit,"platinum":p,"perTrade":pack,"status":o["user"]["status"]});
            let entry = sell
                .entry(seller.into())
                .or_insert((unit, evidence.clone()));
            if unit < entry.0 {
                *entry = (unit, evidence);
            }
        }
    }
    let mut values: Vec<_> = sell.into_values().collect();
    values.sort_by(|a, b| a.0.total_cmp(&b.0));
    values.truncate(5);
    let count = values.len();
    let median = if count == 0 {
        None
    } else if count % 2 == 1 {
        Some(values[count / 2].0)
    } else {
        Some((values[count / 2 - 1].0 + values[count / 2].0) / 2.)
    };
    Ok(
        json!({"price":median.map(|p|(p*100.).round()/100.),"minimumSell":values.first().map(|v|v.0),"maximumBuy":buy.into_iter().max_by(f64::total_cmp),"sampleCount":count,"samples":values.iter().map(|v|v.1.clone()).collect::<Vec<_>>(),"algorithm":ALGORITHM,"source":SOURCE}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn order(user: &str, p: f64) -> Value {
        json!({"id":format!("{user}-{p}"),"type":"sell","visible":true,"quantity":10,"perTrade":1,"platinum":p,"user":{"id":user,"status":"ingame"}})
    }
    #[test]
    fn steflos_reference_is_median_not_minimum_and_normalizes_per_trade() {
        for pack in [1, 2] {
            let rows: Vec<Value> = [21., 21., 25., 25., 30.].iter().enumerate().map(|(i, price)| {
                let mut row = order(&format!("steflos-seller-{i}"), price * pack as f64);
                row["perTrade"] = json!(pack);
                row
            }).collect();
            let quote = calculate(&json!(rows)).unwrap();
            assert_eq!(quote["price"], 25.);
            assert_eq!(quote["minimumSell"], 21.);
            assert_eq!(quote["sampleCount"], 5);
            assert_eq!(quote["algorithm"], ALGORITHM);
            assert_eq!(quote["samples"][0]["perTrade"], pack);
        }
    }
    #[test]
    fn median_uses_five_distinct_online_sellers_and_preserves_evidence() {
        let mut rows = vec![
            order("a", 1.),
            order("a", 2.),
            order("b", 10.),
            order("c", 11.),
            order("d", 12.),
            order("e", 13.),
            order("f", 100.),
        ];
        let mut offline = order("g", 0.1);
        offline["user"]["status"] = json!("offline");
        rows.push(offline);
        let q = calculate(&json!(rows)).unwrap();
        assert_eq!(q["price"], 11.);
        assert_eq!(q["sampleCount"], 5);
        assert_eq!(q["minimumSell"], 1.);
        assert_eq!(q["samples"].as_array().unwrap().len(), 5);
    }
    #[test]
    fn fractions_rank_and_invalid_variants_do_not_mix() {
        let mut a = order("a", 10.);
        a["perTrade"] = json!(2);
        let b = order("b", 6.);
        let q = calculate(&json!([a, b])).unwrap();
        assert_eq!(q["price"], 5.5);
        for (key, value) in [
            ("rank", json!(1)),
            ("charges", json!(2)),
            ("subtype", json!("crafted")),
            ("amberStars", json!(1)),
            ("perTrade", json!(0)),
            ("perTrade", json!(-2)),
            ("perTrade", json!("2")),
            ("visible", json!(false)),
        ] {
            let mut o = order("x", 4.);
            o[key] = value;
            assert!(calculate(&json!([o])).unwrap()["price"].is_null());
        }
        assert!(calculate(&json!({"sell":[]})).is_err());
        assert!(calculate(&json!([])).unwrap()["price"].is_null());
    }
    #[test]
    fn sqlite_restart_failure_and_no_orders_have_distinct_semantics() {
        let path = std::env::temp_dir().join(format!(
            "tenno-price-test-{}-{}.sqlite",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let service = PriceEngine::open(&path).unwrap();
        let slug = "styanax_prime_blueprint";
        service.request(slug, "pc").unwrap();
        let at = now();
        service
            .record(
                slug,
                "pc",
                Ok(calculate(&json!([order("a", 10.), order("b", 11.)])).unwrap()),
                at,
            )
            .unwrap();
        assert_eq!(service.quote(slug, "pc").unwrap()["price"], 10.5);
        drop(service);
        let service = PriceEngine::open(&path).unwrap();
        service
            .record(slug, "pc", Err("timeout".into()), at + 1)
            .unwrap();
        let q = service.quote(slug, "pc").unwrap();
        assert_eq!(q["price"], 10.5);
        assert_eq!(q["fetchedAt"], stamp(at));
        assert_eq!(q["error"], "timeout");
        service
            .record(slug, "pc", Ok(calculate(&json!([])).unwrap()), at)
            .unwrap();
        assert!(service.quote(slug, "pc").unwrap()["price"].is_null());
        assert!(service.request("../bad", "pc").is_err());
        assert!(service.request(slug, "bad").is_err());
        drop(service);
        let _ = std::fs::remove_file(&path);
    }
    #[test]
    fn queue_coalesces_duplicate_requests_and_respects_retry_deadline() {
        let path = std::env::temp_dir().join(format!(
            "tenno-price-queue-{}-{}.sqlite",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let service = PriceEngine::open(&path).unwrap();
        {
            let db = service.db.lock().unwrap();
            db.execute("DELETE FROM price_quotes", []).unwrap();
        }
        for _ in 0..20 {
            service.request("styanax_prime_blueprint", "pc").unwrap();
        }
        let job = service.job().unwrap().unwrap();
        assert!(service.job().unwrap().is_none());
        service
            .record(&job.0, &job.1, Err("timeout".into()), now())
            .unwrap();
        service.active.lock().unwrap().clear();
        assert!(service.job().unwrap().is_none());
        drop(service);
        let _ = std::fs::remove_file(&path);
    }
    #[test]
    fn freshness_platform_and_missing_catalog_are_not_hidden() {
        let path = std::env::temp_dir().join(format!(
            "tenno-price-age-{}-{}.sqlite",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let service = PriceEngine::open(&path).unwrap();
        let slug = "styanax_prime_blueprint";
        service
            .record(
                slug,
                "pc",
                Ok(calculate(&json!([order("a", 4.)])).unwrap()),
                now() - 901,
            )
            .unwrap();
        let q = service.quote(slug, "pc").unwrap();
        assert_eq!(q["stale"], true);
        assert_eq!(q["price"], 4.);
        service.request(slug, "xbox").unwrap();
        service
            .record(
                slug,
                "xbox",
                Ok(calculate(&json!([order("b", 8.)])).unwrap()),
                now(),
            )
            .unwrap();
        assert_eq!(service.quote(slug, "xbox").unwrap()["price"], 8.);
        assert_eq!(service.quote(slug, "pc").unwrap()["price"], 4.);
        service
            .record(
                slug,
                "pc",
                Ok(calculate(&json!([order("a", 4.)])).unwrap()),
                now() - 86401,
            )
            .unwrap();
        assert!(service.quote(slug, "pc").unwrap()["price"].is_null());
        {
            let db = service.db.lock().unwrap();
            let n: i64 = db
                .query_row("SELECT COUNT(*) FROM price_observations", [], |r| r.get(0))
                .unwrap();
            assert_eq!(n, 3);
            db.execute("DELETE FROM price_catalog WHERE slug=?1", [slug])
                .unwrap();
        }
        let s = service.snapshot().unwrap();
        assert_eq!(s["coverage"]["required"], 603);
        assert_eq!(s["coverage"]["missingCatalog"], 1);
        assert_eq!(s["coverage"]["complete"], false);
        drop(service);
        let _ = std::fs::remove_file(&path);
    }
}

pub struct PriceEngine {
    db: Mutex<Connection>,
    active: Mutex<HashSet<(String, String)>>,
    stop: AtomicBool,
    client: reqwest::blocking::Client,
}
impl PriceEngine {
    pub fn open(path: &Path) -> Result<Arc<Self>, String> {
        let mut db = Connection::open(path).map_err(err)?;
        db.busy_timeout(Duration::from_secs(2)).map_err(err)?;
        db.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS price_catalog(slug TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS price_quotes(slug TEXT NOT NULL,platform TEXT NOT NULL,required INTEGER NOT NULL DEFAULT 0,fetched INTEGER,attempted INTEGER,next_due INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,error TEXT,quote TEXT,priority INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(slug,platform)); CREATE TABLE IF NOT EXISTS price_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);").map_err(err)?;
        let transaction = db.transaction().map_err(err)?;
        let seed: Value =
            serde_json::from_str(include_str!("../../public/wm-prices.json")).map_err(err)?;
        for row in seed["rows"].as_array().ok_or("Invalid seed catalog")? {
            transaction
                .execute(
                    "INSERT OR IGNORE INTO price_catalog VALUES(?1,?2)",
                    params![row["slug"].as_str(), row.to_string()],
                )
                .map_err(err)?;
        }
        let relics: Value =
            serde_json::from_str(include_str!("../../public/relic-catalog.json")).map_err(err)?;
        for relic in relics["items"].as_array().ok_or("Invalid relic catalog")? {
            for reward in relic["rewards"]
                .as_array()
                .ok_or("Invalid reward catalog")?
            {
                if let Some(slug) = reward["marketSlug"].as_str() {
                    transaction.execute("INSERT INTO price_quotes(slug,platform,required) VALUES(?1,'pc',1) ON CONFLICT(slug,platform) DO UPDATE SET required=1",[slug]).map_err(err)?;
                }
            }
        }
        // Seed only same-algorithm observations, preserving their actual timestamps.
        for row in seed["rows"].as_array().unwrap() {
            if row["algorithm"] != ALGORITHM {
                continue;
            }
            if let Some(t) = row["priceFetchedAt"]
                .as_str()
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
                .map(|t| t.timestamp())
            {
                if t > now() || now() - t > 86400 {
                    continue;
                }
                let quote = json!({"price":row["unitPrice"],"sampleCount":row["sampleCount"],"minimumSell":row["minimumSell"],"maximumBuy":row["maximumBuy"],"samples":row["samples"],"algorithm":ALGORITHM,"source":SOURCE});
                transaction.execute("INSERT INTO price_quotes(slug,platform,fetched,next_due,quote) VALUES(?1,'pc',?2,?3,?4) ON CONFLICT(slug,platform) DO UPDATE SET fetched=excluded.fetched,next_due=excluded.next_due,quote=excluded.quote WHERE price_quotes.fetched IS NULL OR price_quotes.fetched<excluded.fetched",params![row["slug"].as_str(),t,t+600,quote.to_string()]).map_err(err)?;
            }
        }
        transaction.commit().map_err(err)?;
        db.execute_batch("CREATE TABLE IF NOT EXISTS price_observations(slug TEXT NOT NULL,platform TEXT NOT NULL,attempted INTEGER NOT NULL,price REAL,sample_count INTEGER,error TEXT,algorithm TEXT NOT NULL); CREATE INDEX IF NOT EXISTS price_observations_time ON price_observations(attempted);").map_err(err)?;
        db.execute(
            "DELETE FROM price_observations WHERE attempted<?1",
            [now() - 7 * 86400],
        )
        .map_err(err)?;
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(8))
            .connect_timeout(Duration::from_secs(3))
            .user_agent("TennoLedger/0.1.8 (Warframe companion; public reference prices)")
            .build()
            .map_err(err)?;
        Ok(Arc::new(Self {
            db: Mutex::new(db),
            active: Mutex::new(HashSet::new()),
            stop: AtomicBool::new(false),
            client,
        }))
    }
    pub fn request(&self, slug: &str, platform: &str) -> Result<(), String> {
        if !["pc", "ps4", "xbox", "switch"].contains(&platform) {
            return Err("Invalid platform".into());
        }
        let db = self.db.lock().map_err(err)?;
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM price_catalog WHERE slug=?1)",
                [slug],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !exists {
            return Err("Unknown market item".into());
        }
        db.execute("INSERT INTO price_quotes(slug,platform,priority) VALUES(?1,?2,1) ON CONFLICT(slug,platform) DO UPDATE SET priority=1",params![slug,platform]).map_err(err)?;
        Ok(())
    }
    fn job(&self) -> Result<Option<(String, String)>, String> {
        let mut active = self.active.lock().map_err(err)?;
        let db = self.db.lock().map_err(err)?;
        let mut statement=db.prepare("SELECT slug,platform FROM price_quotes WHERE next_due<=?1 ORDER BY required DESC,priority DESC,COALESCE(fetched,0),next_due LIMIT 64").map_err(err)?;
        let rows = statement
            .query_map([now()], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })
            .map_err(err)?;
        for row in rows {
            let key = row.map_err(err)?;
            if active.insert(key.clone()) {
                return Ok(Some(key));
            }
        }
        Ok(None)
    }
    pub fn record(
        &self,
        slug: &str,
        platform: &str,
        result: Result<Value, String>,
        at: i64,
    ) -> Result<(), String> {
        let mut connection = self.db.lock().map_err(err)?;
        let db = connection.transaction().map_err(err)?;
        let (price, count, error) = match &result {
            Ok(q) => (q["price"].as_f64(), q["sampleCount"].as_i64(), None),
            Err(e) => (None, None, Some(e.as_str())),
        };
        db.execute(
            "INSERT INTO price_observations VALUES(?1,?2,?3,?4,?5,?6,?7)",
            params![slug, platform, at, price, count, error, ALGORITHM],
        )
        .map_err(err)?;
        match result {
            Ok(q) => {
                db.execute("UPDATE price_quotes SET fetched=?3,attempted=?3,next_due=?4,quote=?5,error=NULL,failures=0,priority=0 WHERE slug=?1 AND platform=?2",params![slug,platform,at,at+600,q.to_string()]).map_err(err)?;
            }
            Err(error) => {
                let failures: i64 = db
                    .query_row(
                        "SELECT failures FROM price_quotes WHERE slug=?1 AND platform=?2",
                        params![slug, platform],
                        |r| r.get(0),
                    )
                    .map_err(err)?;
                let delay = (30_i64 * 2_i64.pow((failures as u32).min(5))).min(900);
                db.execute("UPDATE price_quotes SET attempted=?3,next_due=?4,failures=failures+1,error=?5,priority=0 WHERE slug=?1 AND platform=?2",params![slug,platform,at,at+delay,error]).map_err(err)?;
            }
        }
        db.commit().map_err(err)
    }
    fn fetch(&self, slug: &str, platform: &str) -> Result<Value, String> {
        crate::wm_rate::wait();
        let response = self
            .client
            .get(format!("https://api.warframe.market/v2/orders/item/{slug}"))
            .header("Platform", platform)
            .header("Language", "en")
            .send()
            .map_err(err)?;
        if response.status().as_u16() == 429 {
            let retry = response
                .headers()
                .get("Retry-After")
                .and_then(|h| h.to_str().ok())
                .and_then(|s| s.parse().ok())
                .unwrap_or(60);
            crate::wm_rate::backoff(retry);
            return Err(format!("HTTP 429; retry after {retry}s"));
        }
        let body: Value = response
            .error_for_status()
            .map_err(err)?
            .json()
            .map_err(err)?;
        if body.get("error").is_some_and(|v| !v.is_null()) {
            return Err("WM error response".into());
        }
        calculate(&body["data"])
    }
    pub fn start(self: &Arc<Self>) {
        for _ in 0..6 {
            let service = Arc::clone(self);
            std::thread::spawn(move || {
                while !service.stop.load(Ordering::Relaxed) {
                    match service.job() {
                        Ok(Some((slug, platform))) => {
                            let result = service.fetch(&slug, &platform);
                            if let Err(e) = service.record(&slug, &platform, result, now()) {
                                eprintln!("Price persistence failed: {e}");
                            }
                            if let Ok(mut active) = service.active.lock() {
                                active.remove(&(slug, platform));
                            }
                        }
                        _ => std::thread::sleep(Duration::from_millis(200)),
                    }
                }
            });
        }
        let service = Arc::clone(self);
        std::thread::spawn(move || {
            while !service.stop.load(Ordering::Relaxed) {
                let due = {
                    let db = service.db.lock().unwrap_or_else(|e| e.into_inner());
                    db.query_row(
                        "SELECT value FROM price_meta WHERE key='catalog_updated'",
                        [],
                        |r| r.get::<_, String>(0),
                    )
                    .optional()
                    .ok()
                    .flatten()
                    .and_then(|v| v.parse::<i64>().ok())
                    .is_none_or(|t| now() - t >= 86400)
                };
                if due {
                    let _ = service.refresh_catalog();
                }
                for _ in 0..300 {
                    if service.stop.load(Ordering::Relaxed) {
                        return;
                    }
                    std::thread::sleep(Duration::from_secs(1));
                }
            }
        });
    }
    fn refresh_catalog(&self) -> Result<(), String> {
        crate::wm_rate::wait();
        let body: Value = self
            .client
            .get("https://api.warframe.market/v2/items")
            .header("Language", "zh-hans")
            .send()
            .and_then(|r| r.error_for_status())
            .map_err(err)?
            .json()
            .map_err(err)?;
        let rows = body["data"]
            .as_array()
            .filter(|r| r.len() > 100)
            .ok_or("Invalid WM catalog")?;
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction().map_err(err)?;
        for row in rows {
            let slug = row["slug"].as_str().ok_or("Missing slug")?;
            tx.execute(
                "INSERT OR REPLACE INTO price_catalog VALUES(?1,?2)",
                params![slug, row.to_string()],
            )
            .map_err(err)?;
        }
        tx.execute(
            "DELETE FROM price_observations WHERE attempted<?1",
            [now() - 7 * 86400],
        )
        .map_err(err)?;
        tx.execute(
            "INSERT OR REPLACE INTO price_meta VALUES('catalog_updated',?1)",
            [now().to_string()],
        )
        .map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Relaxed);
    }
    pub fn snapshot(&self) -> Result<Value, String> {
        let at = now();
        let db = self.db.lock().map_err(err)?;
        let mut statement=db.prepare("SELECT c.data,q.fetched,q.attempted,q.quote,q.error,q.required FROM price_catalog c LEFT JOIN price_quotes q ON c.slug=q.slug AND q.platform='pc' ORDER BY c.slug").map_err(err)?;
        let mut rows = vec![];
        let expected: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM price_quotes WHERE required=1 AND platform='pc'",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        let (mut found, mut fresh, mut priced, mut failed, mut empty) = (0, 0, 0, 0, 0);
        let records = statement
            .query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, Option<i64>>(1)?,
                    r.get::<_, Option<i64>>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, Option<String>>(4)?,
                    r.get::<_, Option<i64>>(5)?,
                ))
            })
            .map_err(err)?;
        for record in records {
            let (data, fetched, attempted, quote, error, required) = record.map_err(err)?;
            let mut row: Value = serde_json::from_str(&data).map_err(err)?;
            let q: Value = quote
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or(Value::Null);
            let age = fetched.map(|t| at - t);
            let valid = age.is_some_and(|a| (0..=86400).contains(&a));
            row["unitPrice"] = if valid {
                q["price"].clone()
            } else {
                Value::Null
            };
            row["volume"] = Value::Null;
            row["totalValue"] = Value::Null;
            row["priceFetchedAt"] = json!(fetched.map(stamp));
            row["attemptedAt"] = json!(attempted.map(stamp));
            row["lastError"] = json!(error);
            row["algorithm"] = json!(ALGORITHM);
            row["source"] = json!(SOURCE);
            for k in ["sampleCount", "minimumSell", "maximumBuy", "samples"] {
                row[k] = q[k].clone();
            }
            row["stale"] = json!(!age.is_some_and(|a| (0..=900).contains(&a)));
            if required == Some(1) {
                found += 1;
                if age.is_some_and(|a| (0..=900).contains(&a)) {
                    fresh += 1;
                }
                if row["unitPrice"].is_number() {
                    priced += 1;
                }
                if error.is_some() {
                    failed += 1;
                }
                if fetched.is_some() && q["price"].is_null() {
                    empty += 1;
                }
            }
            rows.push(row);
        }
        Ok(
            json!({"rows":rows,"fetchedAt":stamp(at),"platform":"pc","source":SOURCE,"algorithm":ALGORITHM,"coverage":{"required":expected,"fresh":fresh,"priced":priced,"failed":failed,"noOrders":empty,"missingCatalog":expected-found,"complete":expected>0&&fresh==expected&&failed==0,"targetAgeSeconds":900}}),
        )
    }
    pub fn quote(&self, slug: &str, platform: &str) -> Result<Value, String> {
        self.request(slug, platform)?;
        let db = self.db.lock().map_err(err)?;
        let (q, t, error): (Option<String>, Option<i64>, Option<String>) = db
            .query_row(
                "SELECT quote,fetched,error FROM price_quotes WHERE slug=?1 AND platform=?2",
                params![slug, platform],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(err)?;
        let mut q = q
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .unwrap_or(json!({"price":null,"algorithm":ALGORITHM,"source":SOURCE}));
        let age = t.map(|t| now() - t);
        if !age.is_some_and(|a| (0..=86400).contains(&a)) {
            q["price"] = Value::Null;
        }
        q["fetchedAt"] = json!(t.map(stamp).unwrap_or_default());
        q["stale"] = json!(!age.is_some_and(|a| (0..=900).contains(&a)));
        q["error"] = json!(error);
        Ok(q)
    }
}
