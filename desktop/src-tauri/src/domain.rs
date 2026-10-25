use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trade {
    pub id: String,
    pub ts: String,
    pub item_id: String,
    pub name: String,
    pub side: String,
    pub quantity: u32,
    pub platinum: u64,
    #[serde(default)]
    pub partner: String,
    #[serde(default)]
    pub category: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExchangeItem { pub item_id:String, pub quantity:u64 }
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Exchange { pub id:String, pub ts:String, pub partner:String, pub kind:String, pub sent:Vec<ExchangeItem>, pub received:Vec<ExchangeItem>, #[serde(default, skip_serializing_if="Option::is_none")] pub reference_item:Option<ExchangeItem> }
impl Exchange {
    pub fn currency(&self, received:bool)->u64 { (if received {&self.received} else {&self.sent}).iter().filter(|i|i.item_id=="/AF_Special/Platinum").map(|i|i.quantity).sum() }
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dataset {
    #[serde(default)]
    pub general_data_points: Vec<BTreeMap<String, serde_json::Value>>,
    #[serde(default)]
    pub trades: Vec<Trade>,
    #[serde(default)]
    pub exchanges: Vec<Exchange>,
}

fn date(s: &str) -> Result<String, String> {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|d| {
            d.with_timezone(&chrono::Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
        })
        .map_err(|_| format!("无效日期：{s}"))
}
// The shipped stats.js defines RX as received and TX as sent. Keep complex
// exchanges intact; flatten only trades with an unambiguous single-item price.
fn normalize_reference_trades(raw: &mut serde_json::Value) -> Result<(), String> {
    let Some(trades) = raw.get_mut("trades").and_then(|v| v.as_array_mut()) else { return Ok(()); };
    let mut exchanges=Vec::new();
    for (index, trade) in trades.iter_mut().enumerate() {
        if trade.get("rx").is_none() && trade.get("tx").is_none() { continue; }
        let failure = || format!("第 {} 笔 AlecaFrame 交易无法转换：收发条目、方向或数量无效；未导入任何记录", index + 1);
        let read_side = |key: &str| -> Result<(Vec<(String,u64)>,u64),String> {
            let entries = trade.get(key).and_then(|v|v.as_array()).ok_or_else(failure)?;
            // First item determines reference analytics attribution. A sorted map
            // must not become the serialized order when merging repeated entries.
            let mut items:Vec<(String,u64)> = Vec::new();
            let mut positions = BTreeMap::new(); let mut platinum = 0u64;
            for entry in entries {
                let name = entry.get("name").and_then(|v|v.as_str()).filter(|s|!s.trim().is_empty()).ok_or_else(failure)?;
                let count = entry.get("cnt").and_then(|v|v.as_u64()).filter(|n|*n>0).ok_or_else(failure)?;
                if name == "/AF_Special/Platinum" {
                    platinum = platinum.checked_add(count).ok_or_else(failure)?;
                } else {
                    if let Some(&position) = positions.get(name) {
                        let (_,total): &mut (String,u64) = &mut items[position];
                        *total = total.checked_add(count).ok_or_else(failure)?;
                    } else {
                        positions.insert(name.to_owned(),items.len());
                        items.push((name.to_owned(),count));
                    }
                }
            }
            Ok((items,platinum))
        };
        let (rx,received) = read_side("rx")?;
        let (tx,sent) = read_side("tx")?;
        let kind=trade.get("type").and_then(|v|v.as_u64()).ok_or_else(failure)?;
        let single_sent_slot=trade["tx"].as_array().is_some_and(|items|items.len()==1);
        let single_received_slot=trade["rx"].as_array().is_some_and(|items|items.len()==1);
        if !(rx.is_empty() && received>0 && tx.len()==1 && sent==0 && single_sent_slot || tx.is_empty() && sent>0 && rx.len()==1 && received==0 && single_received_slot) {
            let ts=date(trade.get("ts").and_then(|v|v.as_str()).ok_or_else(failure)?)?;
            let partner=trade.get("user").and_then(|v|v.as_str()).ok_or_else(failure)?;
            let side=match kind {0=>"sale",1=>"purchase",2=>"exchange",_=>return Err(failure())};
            let convert=|items:Vec<(String,u64)>,currency:u64| {let mut rows:Vec<serde_json::Value>=items.into_iter().map(|(id,n)|serde_json::json!({"itemId":id,"quantity":n})).collect();if currency>0{rows.push(serde_json::json!({"itemId":"/AF_Special/Platinum","quantity":currency}));}rows};
            exchanges.push(serde_json::json!({"id":format!("alecaframe:{ts}:{index}"),"ts":ts,"partner":partner,"kind":side,"sent":convert(tx,sent),"received":convert(rx,received),"referenceItem":if kind<2 {let first=&trade[if kind==0 {"tx"} else {"rx"}][0];serde_json::json!({"itemId":first["name"],"quantity":first["cnt"]})}else{serde_json::Value::Null}}));
            *trade=serde_json::Value::Null;continue;
        }
        let (items,side,platinum,expected_type) = if rx.is_empty() && received>0 && tx.len()==1 && sent==0 {
            (tx,"sale",received,0)
        } else if tx.is_empty() && sent>0 && rx.len()==1 && received==0 {
            (rx,"purchase",sent,1)
        } else { return Err(failure()); };
        if trade.get("type").and_then(|v|v.as_u64()) != Some(expected_type) { return Err(failure()); }
        let ts = date(trade.get("ts").and_then(|v|v.as_str()).ok_or_else(failure)?)?;
        let partner = trade.get("user").and_then(|v|v.as_str()).ok_or_else(failure)?.to_owned();
        let (item_id,quantity) = items.into_iter().next().ok_or_else(failure)?;
        if quantity>u32::MAX as u64 { return Err(failure()); }
        let is_riven = item_id.starts_with("/AF_Special/Riven/");
        let name = if is_riven { item_id.trim_start_matches("/AF_Special/Riven/").replace('/'," ") }
            else { item_id.rsplit('/').next().unwrap_or(&item_id).to_owned() };
        *trade = serde_json::json!({"id":format!("alecaframe:{ts}:{index}"),"ts":ts,"itemId":item_id,"name":name,"side":side,"quantity":quantity,"platinum":platinum,"partner":partner,"category":if is_riven {"riven"} else {""}});
    }
    trades.retain(|t|!t.is_null());
    if !exchanges.is_empty(){
        let existing=raw.as_object_mut().unwrap().entry("exchanges").or_insert_with(||serde_json::json!([]));
        existing.as_array_mut().ok_or("exchanges 必须为数组")?.extend(exchanges);
    }
    Ok(())
}
pub fn parse(input: &str) -> Result<Dataset, String> {
    if input.len() > 10 * 1024 * 1024 {
        return Err("文件超过 10 MiB".into());
    }
    let mut raw: serde_json::Value = serde_json::from_str(input).map_err(|e| e.to_string())?;
    if !raw.get("generalDataPoints").is_some_and(|v| v.is_array())
        && !raw.get("trades").is_some_and(|v| v.is_array())
        && !raw.get("exchanges").is_some_and(|v|v.is_array())
    {
        return Err("需要 generalDataPoints 或 trades 数组".into());
    }
    normalize_reference_trades(&mut raw)?;
    let mut data: Dataset = serde_json::from_value(raw)
        .map_err(|e| format!("数据格式不兼容：{e}。交易导入需要 MyFrame 格式。"))?;
    if data.general_data_points.len() > 100000 || data.trades.len()+data.exchanges.len() > 100000 {
        return Err("记录数超过限制".into());
    }
    let mut dates = BTreeSet::new();
    for row in &mut data.general_data_points {
        let ts = date(row.get("ts").and_then(|v| v.as_str()).ok_or("缺少 ts")?)?;
        if !dates.insert(ts.clone()) {
            return Err("统计日期重复".into());
        }
        row.insert("ts".into(), ts.into());
        row.retain(|k, _| {
            [
                "ts",
                "plat",
                "credits",
                "endo",
                "ducats",
                "aya",
                "vitus",
                "relicOpened",
                "trades",
                "mr",
                "percentageCompletion",
            ]
            .contains(&k.as_str())
        });
        for (k, v) in row.iter() {
            if k != "ts"
                && !v.is_null()
                && (!v.as_f64().is_some_and(|n| n.is_finite() && n >= 0.0)
                    || k == "percentageCompletion" && v.as_f64().unwrap_or(0.0) > 100.0)
            {
                return Err(format!("数值无效：{k}"));
            }
        }
    }
    data.general_data_points
        .sort_by(|a, b| a["ts"].as_str().cmp(&b["ts"].as_str()));
    let mut ids = BTreeSet::new();
    for t in &mut data.trades {
        t.ts = date(&t.ts)?;
        if t.id.trim().is_empty()
            || t.item_id.trim().is_empty()
            || t.name.trim().is_empty()
            || !ids.insert(t.id.clone())
            || !["purchase", "sale"].contains(&t.side.as_str())
            || t.quantity == 0
            || t.platinum > 1_000_000_000
        {
            return Err("交易 ID、方向、数量或金额无效".into());
        }
    }
    for e in &mut data.exchanges {
        e.ts=date(&e.ts)?;
        if e.id.trim().is_empty() || !ids.insert(e.id.clone()) || !["sale","purchase","exchange"].contains(&e.kind.as_str()) || e.sent.is_empty() || e.received.is_empty() || e.sent.len()>100 || e.received.len()>100 {return Err("交换记录 ID、方向或收发条目无效".into());}
        for entries in [&e.sent,&e.received] {
            let mut seen=BTreeSet::new();
            for item in entries {if item.item_id.trim().is_empty() || !seen.insert(&item.item_id) || item.quantity==0 || item.quantity>1_000_000_000 {return Err("交换记录物品或数量无效".into());}}
        }
        if let Some(first)=&e.reference_item {
            let entries=if e.kind=="sale" {&e.sent} else {&e.received};
            if e.kind=="exchange" || first.quantity==0 || !entries.first().is_some_and(|item|item.item_id==first.item_id && first.quantity<=item.quantity) {
                return Err("原始首项与交换内容不符".into());
            }
        }
        if e.kind=="sale" && (e.received.iter().any(|i|i.item_id!="/AF_Special/Platinum") || e.currency(true)==0 || e.currency(false)>0)
            || e.kind=="purchase" && (e.sent.iter().any(|i|i.item_id!="/AF_Special/Platinum") || e.currency(false)==0 || e.currency(true)>0) {return Err("交换记录买卖方向与收发内容不符".into());}
    }
    Ok(data)
}
#[derive(Default, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ItemTotals {
    pub item_id: String,
    pub name: String,
    pub bought: u64,
    pub sold: u64,
    pub spent: u64,
    pub received: u64,
}
#[derive(Default, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Analytics {
    pub revenue: u64,
    pub expenses: u64,
    pub net_flow: i64,
    pub count: usize,
    pub items: Vec<ItemTotals>,
}
pub fn analyze(data: &Dataset) -> Analytics {
    let mut out = Analytics::default();
    let mut items: BTreeMap<String, ItemTotals> = BTreeMap::new();
    for t in &data.trades {
        let i = items
            .entry(t.item_id.clone())
            .or_insert_with(|| ItemTotals {
                item_id: t.item_id.clone(),
                name: t.name.clone(),
                ..Default::default()
            });
        if t.side == "sale" {
            out.revenue += t.platinum;
            i.received += t.platinum;
            i.sold += u64::from(t.quantity);
        } else {
            out.expenses += t.platinum;
            i.spent += t.platinum;
            i.bought += u64::from(t.quantity);
        }
    }
    out.net_flow = out.revenue as i64 - out.expenses as i64;
    for e in &data.exchanges {out.revenue+=e.currency(true);out.expenses+=e.currency(false);}
    out.net_flow=out.revenue as i64-out.expenses as i64;
    out.count = data.trades.len()+data.exchanges.len();
    out.items = items.into_values().collect();
    out.items
        .sort_by(|a, b| b.received.cmp(&a.received).then(a.item_id.cmp(&b.item_id)));
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stats_balances_keep_vitus_null_and_older_imports_without_new_fields() {
        let data=parse(r#"{"generalDataPoints":[{"ts":"2026-10-24T08:01:00+08:00","vitus":23,"trades":2,"relicOpened":4},{"ts":"2026-10-24T00:00:00Z","vitus":null},{"ts":"2026-10-23T23:00:00Z","plat":50}]}"#).unwrap();
        assert!(!data.general_data_points[0].contains_key("vitus"));
        assert!(data.general_data_points[1]["vitus"].is_null());
        assert_eq!(data.general_data_points[2]["vitus"],23);
        assert_eq!(data.general_data_points[2]["trades"],2);
        assert_eq!(data.general_data_points[2]["relicOpened"],4);
        assert_eq!(parse(&serde_json::to_string(&data).unwrap()).unwrap().general_data_points,data.general_data_points);
    }
    #[test]
    fn stats_vitus_rejects_invalid_values_and_retains_same_day_samples() {
        for value in [serde_json::json!(-1),serde_json::json!("12"),serde_json::json!(true)] {
            let input=serde_json::json!({"generalDataPoints":[{"ts":"2026-10-24T00:00:00Z","vitus":value}]});
            assert!(parse(&input.to_string()).is_err());
        }
        let input=r#"{"generalDataPoints":[{"ts":"2026-10-24T01:00:00Z","vitus":0},{"ts":"2026-10-24T00:00:00Z","vitus":3}]}"#;
        let data=parse(input).unwrap();assert_eq!(data.general_data_points.len(),2);
        assert_eq!(data.general_data_points[0]["vitus"],3);assert_eq!(data.general_data_points[1]["vitus"],0);
    }
    #[test]
    fn multi_item_and_barter_records_roundtrip_without_allocating_prices() {
        let input=serde_json::json!({"trades":[
            {"ts":"2026-10-24T00:00:00Z","type":0,"user":"Fixture","tx":[{"name":"a","cnt":2},{"name":"b","cnt":3}],"rx":[{"name":"/AF_Special/Platinum","cnt":75}]},
            {"ts":"2026-10-24T00:01:00Z","type":2,"user":"Fixture","tx":[{"name":"a","cnt":1},{"name":"/AF_Special/Platinum","cnt":20}],"rx":[{"name":"b","cnt":2},{"name":"/AF_Special/Platinum","cnt":5}]}
        ]});
        let data=parse(&input.to_string()).unwrap();assert!(data.trades.is_empty());assert_eq!(data.exchanges.len(),2);
        assert_eq!(data.exchanges[0].sent[1].quantity,3);assert_eq!(data.exchanges[1].received[0].item_id,"b");
        let stats=analyze(&data);assert_eq!(stats.revenue,80);assert_eq!(stats.expenses,20);assert_eq!(stats.count,2);assert!(stats.items.is_empty());
        let db=crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();db.save(&data).unwrap();
        assert_eq!(serde_json::to_value(db.load().unwrap()).unwrap(),serde_json::to_value(&data).unwrap());
        let mut invalid=serde_json::to_value(&data).unwrap();invalid["exchanges"][1]["id"]=invalid["exchanges"][0]["id"].clone();assert!(parse(&invalid.to_string()).is_err());
    }
    #[test]
    fn repeated_identical_slots_keep_reference_quantity_in_both_directions() {
        for kind in [0,1] {
            let items=serde_json::json!([{"name":"part","cnt":2},{"name":"part","cnt":4}]);
            let currency=serde_json::json!([{"name":"/AF_Special/Platinum","cnt":75}]);
            let (tx,rx)=if kind==0 {(items,currency)} else {(currency,items)};
            let input=serde_json::json!({"trades":[{"ts":"2026-10-24T00:00:00Z","type":kind,"user":"Fixture","tx":tx,"rx":rx}]});
            let data=parse(&input.to_string()).unwrap();
            assert!(data.trades.is_empty());assert_eq!(data.exchanges.len(),1);
            let exchange=&data.exchanges[0];assert_eq!(exchange.reference_item.as_ref().unwrap().quantity,2);
            assert_eq!(if kind==0 {exchange.sent[0].quantity} else {exchange.received[0].quantity},6);
            assert_eq!(exchange.currency(kind==0),75);
            assert_eq!(serde_json::to_value(parse(&serde_json::to_string(&data).unwrap()).unwrap()).unwrap(),serde_json::to_value(&data).unwrap());
        }
    }
    #[test]
    fn reference_attribution_retains_first_slot_quantity_before_merging() {
        let input=serde_json::json!({"trades":[{"ts":"2026-10-24T00:00:00Z","type":0,"user":"Fixture","rx":[{"name":"/AF_Special/Platinum","cnt":75}],"tx":[{"name":"z-first","cnt":2},{"name":"a-second","cnt":1},{"name":"z-first","cnt":4}]}]});
        let data=parse(&input.to_string()).unwrap();
        let first=data.exchanges[0].reference_item.as_ref().unwrap();
        assert_eq!(first.item_id,"z-first");assert_eq!(first.quantity,2);
        assert_eq!(data.exchanges[0].sent[0].quantity,6);
        let db=crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();db.save(&data).unwrap();
        let reimport=parse(&serde_json::to_string(&db.load().unwrap()).unwrap()).unwrap();
        assert_eq!(reimport.exchanges[0].reference_item.as_ref().unwrap().quantity,2);
        let mut old=serde_json::to_value(&data).unwrap();old["exchanges"][0].as_object_mut().unwrap().remove("referenceItem");
        assert!(parse(&old.to_string()).unwrap().exchanges[0].reference_item.is_none());
        for invalid in [serde_json::json!({"itemId":"a-second","quantity":1}),serde_json::json!({"itemId":"z-first","quantity":7}),serde_json::json!({"itemId":"z-first","quantity":0})] {
            let mut bad=serde_json::to_value(&data).unwrap();bad["exchanges"][0]["referenceItem"]=invalid;assert!(parse(&bad.to_string()).is_err());
        }
    }
    #[test]
    fn reference_multi_item_order_survives_merging_storage_and_export() {
        let input=serde_json::json!({"trades":[{
            "ts":"2026-10-24T00:00:00Z","type":2,"user":"Fixture",
            "tx":[{"name":"z-first","cnt":2},{"name":"a-second","cnt":3},{"name":"z-first","cnt":4}],
            "rx":[{"name":"y-first","cnt":1},{"name":"b-second","cnt":5},{"name":"y-first","cnt":2}]
        }]});
        let d=parse(&input.to_string()).unwrap();
        let e=&d.exchanges[0];
        assert_eq!(e.sent.iter().map(|i|(i.item_id.as_str(),i.quantity)).collect::<Vec<_>>(),vec![("z-first",6),("a-second",3)]);
        assert_eq!(e.received.iter().map(|i|(i.item_id.as_str(),i.quantity)).collect::<Vec<_>>(),vec![("y-first",3),("b-second",5)]);
        let db=crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();db.save(&d).unwrap();
        let reimport=parse(&serde_json::to_string(&db.load().unwrap()).unwrap()).unwrap();
        assert_eq!(serde_json::to_value(&d).unwrap(),serde_json::to_value(&reimport).unwrap());
        let mut overflow=input.clone();
        overflow["trades"][0]["tx"][0]["cnt"]=serde_json::json!(u64::MAX);
        assert!(parse(&overflow.to_string()).is_err());
    }
    #[test]
    fn reference_single_item_trades_preserve_direction_quantity_and_total_price() {
        let input=r#"{"trades":[{"ts":"2026-10-24T08:00:00+08:00","type":0,"user":"FixtureSeller","rx":[{"name":"/AF_Special/Platinum","cnt":40},{"name":"/AF_Special/Platinum","cnt":20}],"tx":[{"name":"/Lotus/Test/Part","cnt":3}]},{"ts":"2026-10-24T00:01:00Z","type":1,"user":"FixtureBuyer","tx":[{"name":"/AF_Special/Platinum","cnt":100}],"rx":[{"name":"/AF_Special/Riven/Amprex/Acriada","cnt":1}]}]}"#;
        let d=parse(input).unwrap();
        assert_eq!(d.trades[0].side,"sale");assert_eq!(d.trades[0].quantity,3);assert_eq!(d.trades[0].platinum,60);
        assert_eq!(d.trades[0].partner,"FixtureSeller");assert_eq!(d.trades[0].ts,"2026-10-24T00:00:00.000Z");
        assert_eq!(d.trades[1].side,"purchase");assert_eq!(d.trades[1].name,"Amprex Acriada");assert_eq!(d.trades[1].category,"riven");
        let stats=analyze(&d);assert_eq!(stats.revenue,60);assert_eq!(stats.expenses,100);assert_eq!(stats.count,2);
        assert_eq!(serde_json::to_value(parse(&serde_json::to_string(&d).unwrap()).unwrap()).unwrap(),serde_json::to_value(&d).unwrap());
        assert_eq!(d.trades[0].id,parse(input).unwrap().trades[0].id);
    }
    #[test]
    fn reference_ambiguous_or_invalid_trades_reject_the_whole_import() {
        let valid=serde_json::json!({"ts":"2026-10-24T00:00:00Z","type":0,"user":"Fixture","rx":[{"name":"/AF_Special/Platinum","cnt":10}],"tx":[{"name":"item","cnt":1}]});
        for mode in 0..6 {
            let mut bad=valid.clone();
            match mode {
                0=>bad["type"]=serde_json::json!(7),
                1=>bad["type"]=serde_json::json!(1),
                2=>bad["tx"][0]["cnt"]=serde_json::json!(0),
                3=>bad["rx"][0]["cnt"]=serde_json::json!(1.5),
                4=>bad["rx"][0]["name"]=serde_json::json!("barter"),
                _=>bad["tx"].as_array_mut().unwrap().push(serde_json::json!({"name":"/AF_Special/Platinum","cnt":1})),
            }
            let error=parse(&serde_json::json!({"trades":[valid.clone(),bad]}).to_string()).unwrap_err();
            assert!(!error.is_empty());
        }
    }
    #[test]
    fn rejects_invalid() {
        assert!(parse(r#"{"trades":[{"id":"x"}]}"#).is_err());
        assert!(parse("{}").is_err());
        assert!(
            parse(r#"{"generalDataPoints":[{"ts":"2026-01-01T00:00:00Z","plat":-1}]}"#).is_err()
        );
    }
    #[test]
    fn cashflow_not_cost_basis() {
        let d=parse(r#"{"trades":[{"id":"1","ts":"2026-01-01T00:00:00Z","itemId":"a","name":"甲","side":"purchase","quantity":2,"platinum":100},{"id":"2","ts":"2026-01-02T00:00:00Z","itemId":"a","name":"甲","side":"sale","quantity":1,"platinum":80}]}"#).unwrap();
        let a = analyze(&d);
        assert_eq!(a.net_flow, -20);
        assert_eq!(a.items[0].bought, 2);
    }
    #[test]
    fn removes_identity() {
        let d=parse(r#"{"userHash":"private","generalDataPoints":[{"ts":"2026-01-01T00:00:00Z","plat":1,"secret":"private"}]}"#).unwrap();
        assert!(!serde_json::to_string(&d).unwrap().contains("private"));
    }
    #[test]
    fn duplicate_normalized_dates() {
        assert!(parse(r#"{"generalDataPoints":[{"ts":"2026-01-01T00:00:00Z"},{"ts":"2026-01-01T08:00:00+08:00"}]}"#).is_err());
    }
    #[test]
    fn real_export_when_available() {
        let path = std::path::Path::new("C:/Users/ASUS/Desktop/alecaframeStatsExport.json");
        if path.exists() {
            let d = parse(&std::fs::read_to_string(path).unwrap()).unwrap();
            assert!(!d.general_data_points.is_empty());
            assert!(serde_json::to_value(&d).unwrap().get("userHash").is_none());
        }
    }
}
