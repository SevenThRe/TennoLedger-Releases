//! Incremental, account-bound EE.log events. OCR is never evidence of a completed trade/relic opening.
use crate::{
    collection,
    domain::{Exchange, ExchangeItem},
    AppState,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::{Read, Seek, SeekFrom},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, SystemTime},
};
use tauri::{Emitter, Manager};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Part {
    pub item_id: Option<String>,
    pub quantity: u64,
    pub raw_display_name: String,
    pub rank: Option<u32>,
    pub rank_known: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Finished {
    pub id: String,
    pub account_scope: String,
    pub captured_at: String,
    pub partner: String,
    pub sent: Vec<Part>,
    pub received: Vec<Part>,
    pub kind: String,
    pub complete: bool,
    pub platinum: Option<u64>,
}
#[derive(Debug)]
enum Event {
    Relic { offset: u64 },
    Recommendation,
    RecommendationClosed,
    Trade { offset: u64, lines: Vec<String> },
    Conversation { offset: u64, player: String },
    RivenOpened,
    RivenClosed,
}
#[derive(Default)]
struct Parser {
    requiem: bool,
    era: Option<String>,
    trade: Option<(u64, chrono::DateTime<chrono::Utc>, Vec<String>)>,
    riven_hud: i32,
    last_console: Option<chrono::DateTime<chrono::Utc>>,
    last_relic: Option<chrono::DateTime<chrono::Utc>>,
    recommendation: Option<(chrono::DateTime<chrono::Utc>, bool)>,
}
impl Parser {
    fn line(&mut self, line: &str, offset: u64, now: chrono::DateTime<chrono::Utc>) -> Vec<Event> {
        let mut out = vec![];
        if self
            .trade
            .as_ref()
            .is_some_and(|(_, started, _)| now.signed_duration_since(*started).num_minutes() > 15)
        {
            self.trade = None;
        }
        if line.contains("activeMissionTag=") || line.contains("\"activeMissionTag\" : \"") {
            self.requiem = line
                .split("activeMissionTag=")
                .nth(1)
                .unwrap_or(line)
                .contains("VoidT5");
            self.era = [
                ("VoidT1", "Lith"),
                ("VoidT2", "Meso"),
                ("VoidT3", "Neo"),
                ("VoidT4", "Axi"),
                ("VoidT5", "Requiem"),
            ]
            .iter()
            .find(|(tag, _)| line.contains(tag))
            .map(|(_, era)| era.to_string());
        }
        if line.contains("Got rewards") && !self.requiem {
            self.last_relic = Some(now);
            out.push(Event::Relic { offset });
        }
        if line.contains("UIConsoleTrigger::Open()") {
            self.last_console = Some(now);
        }
        if line.contains("ThemedProjectionManager.lua: LoadingCompleteEnd")
            && self
                .last_console
                .is_none_or(|at| now.signed_duration_since(at).num_milliseconds() > 1000)
        {
            self.recommendation = Some((
                now,
                self.last_relic
                    .is_some_and(|at| now.signed_duration_since(at).num_seconds() < 23),
            ));
            out.push(Event::Recommendation);
        }
        if line.contains("InitMapping for all devices with bindings")
            && self.recommendation.is_some_and(|(started, after_reward)| {
                now.signed_duration_since(started).num_milliseconds()
                    > if after_reward { 3500 } else { 500 }
            })
        {
            self.recommendation = None;
            out.push(Event::RecommendationClosed);
        }
        if let Some(player) = line
            .split("ChatRedux::AddTab: Adding tab with channel name: F")
            .nth(1)
            .and_then(|text| {
                text.split_once(" to index")
                    .map(|(player, _)| player.trim())
            })
            .filter(|player| {
                !player.is_empty()
                    && player.len() <= 64
                    && player
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
            })
        {
            out.push(Event::Conversation {
                offset,
                player: player.to_owned(),
            });
        }
        let dialog = line.contains("Dialog.lua: Dialog::CreateOkCancel(description=");
        let begins = dialog
            && (line.contains("Are you sure you want to accept this trade? You are offering")
                || line.contains("你确定要接受这次交易")
                || line.contains("你确定要接受该交易")
                || line.contains("是否接受此次交易"));
        if begins {
            self.trade = Some((offset, now, vec![line.into()]));
        } else if line.contains("The trade was successful!, ")
            || dialog
                && (line.contains("交易成功") || line.contains("/Lotus/Language/Menu/TradeSuccess"))
        {
            if let Some((offset, _, lines)) = self.trade.take() {
                out.push(Event::Trade { offset, lines });
            }
        } else if let Some((_, _, lines)) = &mut self.trade {
            if lines.len() < 100
                && lines.iter().map(String::len).sum::<usize>() + line.len() < 65536
            {
                lines.push(line.into());
            } else {
                self.trade = None;
            }
        }
        if line.contains("ThemedDetailedPurchaseDialog.lua: PopulateInfo->/Lotus/StoreItems/Upgrades/Mods/Randomized/"){out.push(Event::RivenOpened);}
        if let Some(value) = line
            .split("ThemedDetailedPurchaseDialog.lua: DBG: HudVis ")
            .nth(1)
            .and_then(|s| s.trim().parse::<i32>().ok())
        {
            if value < self.riven_hud {
                out.push(Event::RivenClosed);
            }
            self.riven_hud = value;
        }
        out
    }
}
fn clean(text: &str) -> String {
    let mut tags = false;
    text.chars()
        .filter(|c| {
            if *c == '<' {
                tags = true;
                return false;
            }
            if *c == '>' {
                tags = false;
                return false;
            }
            !tags && !('\u{e000}'..='\u{f8ff}').contains(c)
        })
        .collect::<String>()
        .trim()
        .to_owned()
}
fn lookup(catalog: &collection::Catalog) -> BTreeMap<String, BTreeSet<String>> {
    let tradables: BTreeMap<String, String> =
        serde_json::from_str(include_str!("../../public/inventory-tradables.json"))
            .unwrap_or_default();
    let mut names: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for i in &catalog.items {
        if !tradables.contains_key(&i.id) {
            continue;
        }
        for name in [&i.name, &i.zh] {
            if !name.is_empty() && !name.contains('\u{fffd}') {
                names
                    .entry(clean(name).to_lowercase())
                    .or_default()
                    .insert(i.id.clone());
            }
        }
    }
    names
}
fn parse_trade(
    id: String,
    scope: String,
    lines: &[String],
    catalog: &collection::Catalog,
    at: String,
) -> Finished {
    let names = lookup(catalog);
    let mut tx = vec![];
    let mut rx = vec![];
    let mut receive = false;
    let mut partner = String::new();
    let mut complete = true;
    let mut opened = false;
    for text in lines
        .iter()
        .flat_map(|s| s.split("\\n").flat_map(|s| s.split('\n')))
    {
        let mut line = text.trim();
        if let Some((_, rest)) = line.split_once("description=") {
            line = rest;
        }
        if line.contains("Are you sure you want to accept this trade? You are offering") {
            opened = true;
            line = line.split_once("You are offering").map_or("", |(_, s)| s);
        }
        if line.contains("你确定要接受") || line.contains("是否接受此次交易") {
            opened = true;
            complete = false;
            continue;
        }
        if !opened {
            continue;
        }
        if let Some((_, rest)) = line.split_once("and will receive from ") {
            if let Some((name, _)) = rest.split_once(" the following:") {
                partner = clean(name);
                receive = true;
                continue;
            }
            complete = false;
        }
        if let Some((head, _)) = line.split_once(", title= leftItem=/") {
            line = head;
        }
        let value = clean(line);
        if value.is_empty() {
            continue;
        }
        if value.contains("Dialog.lua:") || value.contains("Sys [") || value.contains(" [Info]: ") {
            continue;
        }
        let (name, quantity) = if let Some((name, count)) = value.rsplit_once(" x ") {
            match count.trim().parse::<u64>() {
                Ok(n) if (1..=1_000_000_000).contains(&n) => (name.trim().to_owned(), n),
                _ => {
                    complete = false;
                    continue;
                }
            }
        } else {
            (value, 1)
        };
        let item = if matches!(name.to_lowercase().as_str(), "platinum" | "白金") {
            Some("/AF_Special/Platinum".into())
        } else {
            names
                .get(&name.to_lowercase())
                .filter(|ids| ids.len() == 1)
                .and_then(|ids| ids.first().cloned())
        };
        if item.is_none() {
            complete = false;
        }
        let rank_known = item.as_ref().is_some_and(|id| {
            !catalog
                .items
                .iter()
                .any(|i| i.id == *id && matches!(i.category.as_str(), "mod" | "arcane"))
        });
        let part = Part {
            item_id: item,
            quantity,
            raw_display_name: name,
            rank: None,
            rank_known,
        };
        if receive {
            rx.push(part);
        } else {
            tx.push(part);
        }
    }
    if partner.is_empty()
        || partner.chars().count() > 64
        || !receive
        || tx.is_empty() && rx.is_empty()
    {
        complete = false;
    }
    // Multiple identical slots are one ledger item; preserve uncertain ranks separately in the event.
    for parts in [&mut tx, &mut rx] {
        let mut merged: Vec<Part> = vec![];
        for part in std::mem::take(parts) {
            if let Some(existing) = merged.iter_mut().find(|p| {
                p.item_id.is_some()
                    && p.item_id == part.item_id
                    && p.rank == part.rank
                    && p.rank_known == part.rank_known
            }) {
                if let Some(total) = existing
                    .quantity
                    .checked_add(part.quantity)
                    .filter(|n| *n <= 1_000_000_000)
                {
                    existing.quantity = total;
                } else {
                    complete = false;
                }
            } else {
                merged.push(part);
            }
        }
        *parts = merged;
    }
    let platinum = |parts: &[Part]| {
        parts
            .iter()
            .filter(|p| p.item_id.as_deref() == Some("/AF_Special/Platinum"))
            .try_fold(0u64, |n, p| n.checked_add(p.quantity))
    };
    let (sent_plat, received_plat) = (platinum(&tx), platinum(&rx));
    let noncash = |p: &Part| p.item_id.as_deref() != Some("/AF_Special/Platinum");
    let kind = if tx.iter().any(noncash)
        && rx.iter().all(|p| !noncash(p))
        && sent_plat == Some(0)
        && received_plat.is_some_and(|n| n > 0)
    {
        "sale"
    } else if rx.iter().any(noncash)
        && tx.iter().all(|p| !noncash(p))
        && received_plat == Some(0)
        && sent_plat.is_some_and(|n| n > 0)
    {
        "purchase"
    } else {
        "exchange"
    };
    let value = if complete {
        match kind {
            "sale" => received_plat,
            "purchase" => sent_plat,
            _ => None,
        }
    } else {
        None
    };
    Finished {
        id,
        account_scope: scope,
        captured_at: at,
        partner,
        sent: tx,
        received: rx,
        kind: kind.into(),
        complete,
        platinum: value,
    }
}
pub fn matches_manual(exchange: &Exchange, trade: &crate::domain::Trade) -> bool {
    if trade.category != "chat-confirmed"
        || trade.partner.is_empty()
        || !exchange.partner.eq_ignore_ascii_case(&trade.partner)
        || exchange.kind != trade.side
    {
        return false;
    }
    let (Ok(event_at), Ok(quote_at)) = (
        chrono::DateTime::parse_from_rfc3339(&exchange.ts),
        chrono::DateTime::parse_from_rfc3339(&trade.ts),
    ) else {
        return false;
    };
    let elapsed = event_at.signed_duration_since(quote_at).num_seconds();
    if !(0..=900).contains(&elapsed) {
        return false;
    }
    let (items, cash) = if exchange.kind == "sale" {
        (&exchange.sent, &exchange.received)
    } else if exchange.kind == "purchase" {
        (&exchange.received, &exchange.sent)
    } else {
        return false;
    };
    items.len() == 1
        && items[0].item_id == trade.item_id
        && items[0].quantity == trade.quantity as u64
        && cash.len() == 1
        && cash[0].item_id == "/AF_Special/Platinum"
        && cash[0].quantity == trade.platinum
}
fn initialize(db: &rusqlite::Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS confirmed_game_events(scope TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,captured_at TEXT NOT NULL,PRIMARY KEY(scope,id));").map_err(|e|e.to_string())
}
fn record(
    db: &crate::store::Store,
    scope: &str,
    id: &str,
    kind: &str,
    payload: &Value,
    at: &str,
) -> Result<bool, String> {
    db.require_expected_scope(Some(scope))?;
    initialize(&db.db)?;
    let tx = db.db.unchecked_transaction().map_err(|e| e.to_string())?;
    let added = tx
        .execute(
            "INSERT OR IGNORE INTO confirmed_game_events VALUES(?1,?2,?3,?4,?5)",
            rusqlite::params![scope, id, kind, payload.to_string(), at],
        )
        .map_err(|e| e.to_string())?;
    if added == 0 {
        return Ok(false);
    }
    if crate::app_preferences::read(&tx)?.record_stats {
        let mut data = db.load()?;
        let ts = chrono::DateTime::parse_from_rfc3339(at)
            .map_err(|_| "事件时间无效")?
            .with_timezone(&chrono::Utc)
            .to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let field = if kind == "relic" {
            "relicOpened"
        } else {
            "trades"
        };
        if let Some(row) = data
            .general_data_points
            .iter_mut()
            .find(|row| row.get("ts").and_then(Value::as_str) == Some(ts.as_str()))
        {
            let count = row
                .get(field)
                .and_then(Value::as_u64)
                .unwrap_or(0)
                .checked_add(1)
                .ok_or("事件数量溢出")?;
            row.insert(field.into(), json!(count));
        } else {
            let row = BTreeMap::from([("ts".into(), json!(ts)), (field.into(), json!(1))]);
            data.general_data_points.push(row);
        }
        if kind == "trade" {
            let finished: Finished =
                serde_json::from_value(payload.clone()).map_err(|e| e.to_string())?;
            if finished.complete
                && !data.exchanges.iter().any(|e| e.id == finished.id)
                && !data.trades.iter().any(|e| e.id == finished.id)
            {
                let part = |p: Part| ExchangeItem {
                    item_id: p.item_id.unwrap_or_default(),
                    quantity: p.quantity,
                };
                let exchange = Exchange {
                    id: finished.id,
                    ts: finished.captured_at,
                    partner: finished.partner,
                    kind: finished.kind,
                    sent: finished.sent.into_iter().map(part).collect(),
                    received: finished.received.into_iter().map(part).collect(),
                    reference_item: None,
                };
                let matches: Vec<_> = data
                    .trades
                    .iter()
                    .enumerate()
                    .filter(|(_, t)| matches_manual(&exchange, t))
                    .map(|(i, _)| i)
                    .collect();
                if matches.len() == 1 {
                    data.trades.remove(matches[0]);
                }
                data.exchanges.push(exchange);
            }
        }
        // Persist through the same open transaction, without calling a second transaction helper.
        let data = crate::domain::parse(&serde_json::to_string(&data).map_err(|e| e.to_string())?)?;
        let encoded = serde_json::to_string(&data).map_err(|e| e.to_string())?;
        if scope==crate::account_scope::LEGACY{tx.execute("INSERT INTO documents(id,payload)VALUES(1,?1)ON CONFLICT(id)DO UPDATE SET payload=excluded.payload",[encoded])}else{tx.execute("INSERT INTO account_documents(scope,payload)VALUES(?1,?2)ON CONFLICT(scope)DO UPDATE SET payload=excluded.payload",rusqlite::params![scope,encoded])}.map_err(|e|e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(true)
}
#[derive(Clone)]
pub struct Watcher(Arc<AtomicBool>);
impl Watcher {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
    pub fn stop(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn start(&self, app: tauri::AppHandle) {
        let stopped = self.0.clone();
        std::thread::spawn(move || {
            let Some(path) = std::env::var_os("LOCALAPPDATA")
                .map(|p| std::path::PathBuf::from(p).join("Warframe/EE.log"))
            else {
                return;
            };
            let Ok(catalog) = collection::catalog() else {
                return;
            };
            let mut binding = None;
            let mut creation = None;
            let mut offset = 0u64;
            let mut pending = vec![];
            let mut discard = false;
            let mut line_offset = 0;
            let mut parser = Parser::default();
            while !stopped.load(Ordering::SeqCst) {
                std::thread::sleep(Duration::from_millis(500));
                if stopped.load(Ordering::SeqCst) {
                    break;
                }
                let current = app
                    .state::<crate::collector::Collector>()
                    .arbitration_binding();
                let Ok(mut file) = std::fs::File::open(&path) else {
                    continue;
                };
                let Ok(meta) = file.metadata() else {
                    continue;
                };
                let changed =
                    current != binding || creation != meta.created().ok() || meta.len() < offset;
                if changed {
                    binding = current;
                    creation = meta.created().ok();
                    offset = meta.len();
                    line_offset = offset;
                    pending.clear();
                    discard = false;
                    parser = Parser::default();
                    continue;
                }
                let Some((scope, _)) = &binding else {
                    offset = meta.len();
                    pending.clear();
                    continue;
                };
                if file.seek(SeekFrom::Start(offset)).is_err() {
                    continue;
                }
                let mut bytes = vec![];
                if file.take(262144).read_to_end(&mut bytes).is_err() {
                    continue;
                }
                for byte in bytes {
                    offset += 1;
                    if byte != b'\n' {
                        if !discard {
                            if pending.len() < 65536 {
                                pending.push(byte);
                            } else {
                                pending.clear();
                                parser.trade = None;
                                discard = true;
                            }
                        }
                        continue;
                    }
                    if discard {
                        discard = false;
                        pending.clear();
                        line_offset = offset;
                        continue;
                    }
                    let line = String::from_utf8_lossy(&pending).into_owned();
                    pending.clear();
                    let at = chrono::Utc::now();
                    for event in parser.line(&line, line_offset, at) {
                        let stamp = creation
                            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                            .map_or(0, |d| d.as_nanos());
                        let state = app.state::<AppState>();
                        match event {
                            Event::Relic { offset: position } => {
                                let id = format!(
                                    "game-{:x}",
                                    Sha256::digest(
                                        format!("{scope}:{stamp}:{position}:relic").as_bytes()
                                    )
                                );
                                if let Ok(db) = state.0.lock() {
                                    if record(
                                        &db,
                                        scope,
                                        &id,
                                        "relic",
                                        &json!({"id":id,"accountScope":scope}),
                                        &at.to_rfc3339(),
                                    )
                                    .unwrap_or(false)
                                    {
                                        let _ = app.emit("ledger-updated", ());
                                    }
                                }
                            }
                            Event::Trade {
                                offset: position,
                                lines,
                            } => {
                                let id = format!(
                                    "game-{:x}",
                                    Sha256::digest(
                                        format!("{scope}:{stamp}:{position}:trade").as_bytes()
                                    )
                                );
                                let finished = parse_trade(
                                    id.clone(),
                                    scope.clone(),
                                    &lines,
                                    &catalog,
                                    at.to_rfc3339(),
                                );
                                let payload =
                                    serde_json::to_value(&finished).unwrap_or(Value::Null);
                                let accepted = state
                                    .0
                                    .lock()
                                    .ok()
                                    .and_then(|db| {
                                        record(&db, scope, &id, "trade", &payload, &at.to_rfc3339())
                                            .ok()
                                    })
                                    .unwrap_or(false);
                                if accepted {
                                    let _ = app.emit("ledger-updated", ());
                                    let _ = app.emit("game-trade-finished", &finished);
                                    if let Some(overlays) =
                                        app.try_state::<Arc<crate::overlays::Service>>()
                                    {
                                        let _ = overlays.show(
                                            &app,
                                            "trade-finished",
                                            payload.clone(),
                                            false,
                                        );
                                    }
                                }
                            }
                            Event::Recommendation => {
                                let payload = json!({"accountScope":scope,"capturedAt":at.to_rfc3339(),"era":parser.era});
                                let _ = app.emit("game-relic-selection", &payload);
                                if let Some(overlays) =
                                    app.try_state::<Arc<crate::overlays::Service>>()
                                {
                                    let _ = overlays.show(
                                        &app,
                                        "relic-recommendations",
                                        payload,
                                        false,
                                    );
                                }
                            }
                            Event::RecommendationClosed => {
                                if let Some(overlays) =
                                    app.try_state::<Arc<crate::overlays::Service>>()
                                {
                                    overlays.dismiss(&app, "relic-recommendations");
                                }
                            }
                            Event::Conversation {
                                offset: position,
                                player,
                            } => {
                                let id = format!(
                                    "conversation-{:x}",
                                    Sha256::digest(
                                        format!("{scope}:{stamp}:{position}:conversation")
                                            .as_bytes()
                                    )
                                );
                                if let Some(world) =
                                    app.try_state::<Arc<crate::world::WorldService>>()
                                {
                                    let _ = world.publish_conversation(&app, id, scope, &player);
                                }
                            }
                            Event::RivenOpened => {
                                let _ = app.emit(
                                    "game-riven-opened",
                                    json!({"accountScope":scope,"capturedAt":at.to_rfc3339()}),
                                );
                            }
                            Event::RivenClosed => {
                                let _ = app.emit("game-riven-closed", ());
                                if let Some(overlays) =
                                    app.try_state::<Arc<crate::overlays::Service>>()
                                {
                                    overlays.dismiss(&app, "riven-chat");
                                    overlays.dismiss(&app, "riven-reroll");
                                }
                            }
                        }
                    }
                    line_offset = offset;
                }
            }
        });
    }
}
#[tauri::command]
pub fn game_recent_trade_finishes(
    expected_scope: String,
    state: tauri::State<AppState>,
) -> Result<Vec<Finished>, String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    initialize(&db.db)?;
    let since = (chrono::Utc::now() - chrono::Duration::minutes(15)).to_rfc3339();
    let mut q=db.db.prepare("SELECT payload FROM confirmed_game_events WHERE scope=?1 AND kind='trade' AND captured_at>=?2 ORDER BY captured_at DESC LIMIT 100").map_err(|e|e.to_string())?;
    let rows = q
        .query_map(rusqlite::params![expected_scope, since], |r| {
            r.get::<_, String>(0)
        })
        .map_err(|e| e.to_string())?;
    rows.map(|r| serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string()))
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rewards_are_log_events_and_requiem_is_not_invented_from_ocr() {
        let mut p = Parser::default();
        let now = chrono::Utc::now();
        assert!(p.line("OCR reward card", 1, now).is_empty());
        assert!(matches!(
            p.line("Got rewards", 2, now)[0],
            Event::Relic { .. }
        ));
        p.line("activeMissionTag=VoidT5", 3, now);
        assert!(p.line("Got rewards", 4, now).is_empty());
        p.line("activeMissionTag=VoidT3", 5, now);
        assert_eq!(p.line("Got rewards", 6, now).len(), 1);
    }
    #[test]
    fn private_conversation_uses_exact_log_channel_not_chat_text() {
        let mut p = Parser::default();
        let now = chrono::Utc::now();
        assert!(
            matches!(&p.line("ChatRedux::AddTab: Adding tab with channel name: FFixture-1 to index 3",9,now)[0],Event::Conversation{offset:9,player}if player=="Fixture-1")
        );
        for line in [
            "ChatRedux::AddTab: Adding tab with channel name: CRecruiting to index 2",
            "ChatRedux::AddTab: Adding tab with channel name: Fhttps://bad to index 2",
            "Fixture says hello",
        ] {
            assert!(p.line(line, 10, now).is_empty());
        }
    }
    #[test]
    fn recommendation_respects_console_and_selection_lifetime() {
        let mut p = Parser::default();
        let now = chrono::Utc::now();
        p.line("UIConsoleTrigger::Open()", 0, now);
        assert!(p
            .line("ThemedProjectionManager.lua: LoadingCompleteEnd", 1, now)
            .is_empty());
        assert!(matches!(
            p.line(
                "ThemedProjectionManager.lua: LoadingCompleteEnd",
                2,
                now + chrono::Duration::seconds(2)
            )[0],
            Event::Recommendation
        ));
        assert!(p
            .line(
                "InitMapping for all devices with bindings",
                3,
                now + chrono::Duration::milliseconds(2200)
            )
            .is_empty());
        assert!(matches!(
            p.line(
                "InitMapping for all devices with bindings",
                4,
                now + chrono::Duration::seconds(3)
            )[0],
            Event::RecommendationClosed
        ));
    }
    #[test]
    fn success_requires_a_current_trade_confirmation_and_is_consumed_once() {
        let now = chrono::Utc::now();
        let mut p = Parser::default();
        assert!(p.line("The trade was successful!, ", 1, now).is_empty());
        p.line("Dialog.lua: Dialog::CreateOkCancel(description=Are you sure you want to accept this trade? You are offering",2,now);
        p.line("Platinum x 10", 3, now);
        p.line("and will receive from Fixture the following:", 4, now);
        assert!(matches!(
            p.line("The trade was successful!, ", 5, now)[0],
            Event::Trade { offset: 2, .. }
        ));
        assert!(p.line("The trade was successful!, ", 6, now).is_empty());
        p.line("Dialog.lua: Dialog::CreateOkCancel(description=Are you sure you want to accept this trade? You are offering",7,now);
        assert!(p
            .line(
                "The trade was successful!, ",
                8,
                now + chrono::Duration::minutes(16)
            )
            .is_empty());
    }
    #[test]
    fn exact_trade_items_total_platinum_and_unknown_ranks_are_preserved() {
        let catalog = collection::catalog().unwrap();
        let lines=vec!["Dialog.lua: Dialog::CreateOkCancel(description=Are you sure you want to accept this trade? You are offering".into(),"Serration x 2".into(),"and will receive from Fixture the following:".into(),"Platinum x 20, title= leftItem=/Menu/Confirm_Item_Ok".into()];
        let r = parse_trade(
            "test".into(),
            "scope".into(),
            &lines,
            &catalog,
            chrono::Utc::now().to_rfc3339(),
        );
        assert!(r.complete);
        assert_eq!(r.kind, "sale");
        assert_eq!(r.platinum, Some(20));
        assert_eq!(r.sent[0].quantity, 2);
        let mut repeated = lines.clone();
        repeated.insert(2, "Serration x 3".into());
        let merged = parse_trade(
            "repeat".into(),
            "scope".into(),
            &repeated,
            &catalog,
            chrono::Utc::now().to_rfc3339(),
        );
        assert!(merged.complete);
        assert_eq!(merged.sent.len(), 1);
        assert_eq!(merged.sent[0].quantity, 5);
        assert!(!r.sent[0].rank_known);
        assert!(r.sent[0].rank.is_none());
        let mut bad = lines;
        bad[1] = "Unrecognised future item x 2".into();
        assert!(
            !parse_trade(
                "t".into(),
                "s".into(),
                &bad,
                &catalog,
                chrono::Utc::now().to_rfc3339()
            )
            .complete
        );
    }
    #[test]
    fn game_event_is_idempotent_and_counter_is_atomic_with_ledger() {
        let store = crate::store::Store::open(std::path::Path::new(":memory:")).unwrap();
        let scope = crate::account_scope::LEGACY;
        let now = chrono::Utc::now().to_rfc3339();
        assert!(record(&store, scope, "event", "relic", &json!({}), &now).unwrap());
        assert!(!record(&store, scope, "event", "relic", &json!({}), &now).unwrap());
        assert_eq!(store.load().unwrap().general_data_points.len(), 1);
        assert_eq!(
            store.load().unwrap().general_data_points[0]["relicOpened"],
            1
        );
        assert!(record(
            &store,
            "acct-v1-invalid",
            "other",
            "relic",
            &json!({}),
            &now
        )
        .is_err());
    }
}
