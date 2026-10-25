use crate::AppState;
use rusqlite::OptionalExtension;
use serde::Serialize;
#[derive(Serialize)]
pub struct Receipt {
    pub acquired: bool,
    pub status: String,
}
fn key(event: &str, order: &str, account: &str, platform: &str) -> Result<(), String> {
    if event.is_empty()
        || event.len() > 180
        || order.is_empty()
        || order.len() > 100
        || account.is_empty()
        || account.len() > 150
        || [event, order, account]
            .iter()
            .any(|s| s.chars().any(char::is_control))
        || !matches!(platform, "pc" | "ps4" | "xbox" | "switch" | "mobile")
    {
        return Err("成交回执标识无效".into());
    }
    Ok(())
}
fn initialize(db: &rusqlite::Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS trade_completion_receipts(scope TEXT NOT NULL,event TEXT NOT NULL,order_id TEXT NOT NULL,account TEXT NOT NULL,platform TEXT NOT NULL,status TEXT NOT NULL,error TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(scope,event,order_id,account,platform));").map_err(|e|e.to_string())
}
fn reserve(
    db: &rusqlite::Connection,
    scope: &str,
    event: &str,
    order: &str,
    account: &str,
    platform: &str,
) -> Result<Receipt, String> {
    key(event, order, account, platform)?;
    initialize(db)?;
    let added=db.execute("INSERT OR IGNORE INTO trade_completion_receipts(scope,event,order_id,account,platform,status,updated_at)VALUES(?1,?2,?3,?4,?5,'inflight',?6)",rusqlite::params![scope,event,order,account,platform,chrono::Utc::now().to_rfc3339()]).map_err(|e|e.to_string())?;
    let status:String=db.query_row("SELECT status FROM trade_completion_receipts WHERE scope=?1 AND event=?2 AND order_id=?3 AND account=?4 AND platform=?5",rusqlite::params![scope,event,order,account,platform],|r|r.get(0)).map_err(|e|e.to_string())?;
    Ok(Receipt {
        acquired: added == 1,
        status,
    })
}
fn status(
    db: &rusqlite::Connection,
    scope: &str,
    event: &str,
    order: &str,
    account: &str,
    platform: &str,
) -> Result<Option<String>, String> {
    key(event, order, account, platform)?;
    initialize(db)?;
    db.query_row("SELECT status FROM trade_completion_receipts WHERE scope=?1 AND event=?2 AND order_id=?3 AND account=?4 AND platform=?5",rusqlite::params![scope,event,order,account,platform],|r|r.get(0)).optional().map_err(|e|e.to_string())
}
#[tauri::command]
pub fn trade_completion_status(
    event_id: String,
    order_id: String,
    market_account: String,
    platform: String,
    expected_scope: String,
    state: tauri::State<AppState>,
) -> Result<Option<String>, String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    status(
        &db.db,
        &expected_scope,
        &event_id,
        &order_id,
        &market_account,
        &platform,
    )
}
#[tauri::command]
pub fn trade_completion_intent(
    event_id: String,
    order_id: String,
    market_account: String,
    platform: String,
    expected_scope: String,
    state: tauri::State<AppState>,
) -> Result<Receipt, String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    reserve(
        &db.db,
        &expected_scope,
        &event_id,
        &order_id,
        &market_account,
        &platform,
    )
}
#[tauri::command]
pub fn trade_completion_result(
    event_id: String,
    order_id: String,
    market_account: String,
    platform: String,
    expected_scope: String,
    outcome: String,
    error: Option<String>,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    key(&event_id, &order_id, &market_account, &platform)?;
    if !matches!(outcome.as_str(), "accepted" | "uncertain") {
        return Err("成交回执状态无效".into());
    }
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    initialize(&db.db)?;
    let previous:Option<String>=db.db.query_row("SELECT status FROM trade_completion_receipts WHERE scope=?1 AND event=?2 AND order_id=?3 AND account=?4 AND platform=?5",rusqlite::params![expected_scope,event_id,order_id,market_account,platform],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
    if previous.as_deref() != Some("inflight") {
        return Err("成交操作没有有效执行意图，或已完成".into());
    }
    db.db.execute("UPDATE trade_completion_receipts SET status=?6,error=?7,updated_at=?8 WHERE scope=?1 AND event=?2 AND order_id=?3 AND account=?4 AND platform=?5",rusqlite::params![expected_scope,event_id,order_id,market_account,platform,outcome,error.map(|s|s.chars().filter(|c|!c.is_control()).take(500).collect::<String>()),chrono::Utc::now().to_rfc3339()]).map_err(|e|e.to_string())?;
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn an_intent_is_reserved_once_and_each_scope_is_separate() {
        let db = rusqlite::Connection::open_in_memory().unwrap();
        assert!(status(&db, "a", "game-1", "order", "account", "pc")
            .unwrap()
            .is_none());
        assert!(
            reserve(&db, "a", "game-1", "order", "account", "pc")
                .unwrap()
                .acquired
        );
        assert_eq!(
            status(&db, "a", "game-1", "order", "account", "pc")
                .unwrap()
                .as_deref(),
            Some("inflight")
        );
        let duplicate = reserve(&db, "a", "game-1", "order", "account", "pc").unwrap();
        assert!(!duplicate.acquired);
        assert_eq!(duplicate.status, "inflight");
        assert!(
            reserve(&db, "b", "game-1", "order", "account", "pc")
                .unwrap()
                .acquired
        );
        assert!(
            reserve(&db, "a", "game-1", "order", "other", "pc")
                .unwrap()
                .acquired
        );
        assert!(key("", "order", "account", "pc").is_err());
    }
    #[test]
    fn pending_receipt_survives_connection_restart_without_retry() {
        let path = std::env::temp_dir().join(format!(
            "myframe-trade-receipt-{}-{}.sqlite3",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        {
            let db = rusqlite::Connection::open(&path).unwrap();
            assert!(
                reserve(&db, "scope", "game-1", "order", "account", "pc")
                    .unwrap()
                    .acquired
            );
        }
        let db = rusqlite::Connection::open(&path).unwrap();
        let restored = reserve(&db, "scope", "game-1", "order", "account", "pc").unwrap();
        assert!(!restored.acquired);
        assert_eq!(restored.status, "inflight");
        drop(db);
        std::fs::remove_file(path).unwrap();
    }
}
