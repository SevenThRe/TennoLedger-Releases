//! Local log watcher, checkpoints and user-driven streamed imports share one reducer.
use crate::{
    arbitration_history as history,
    arbitration_run::{Metadata, Parser, Run},
    AppState,
};
use serde::Serialize;
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};
use tauri::{Emitter, Manager};

struct Import {
    id: String,
    scope: String,
    parser: Parser,
    bytes: u64,
    runs: Vec<Run>,
}
fn summary_candidate(parser:&Parser)->Option<Run>{
    if parser.active.as_ref().is_some_and(|r|r.status=="recording"){return None;}
    parser.active.clone().or_else(||parser.finished.last().cloned())
}
struct Runtime {
    parser: Parser,
    latest: Option<Run>,
    binding: Option<(String, u64)>,
    error: Option<String>,
    code: String,
    import: Option<Import>,
}
pub struct Capture(Mutex<Runtime>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub code: String,
    pub error: Option<String>,
    pub current: Option<Run>,
    pub auto_open: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub id: String,
    pub bytes: u64,
    pub runs: usize,
    pub added: usize,
    pub duplicates: usize,
}
#[derive(Default)]
pub struct Tail {
    offset: u64,
    created: Option<SystemTime>,
    initialized: bool,
    prefix: Vec<u8>,
}
impl Tail {
    pub fn poll(&mut self, path: &Path) -> Result<(bool, Vec<u8>, Vec<u8>), String> {
        let mut file = File::open(path).map_err(|_| "未找到 Warframe EE.log")?;
        let meta = file.metadata().map_err(|_| "无法读取日志状态")?;
        let prefix_len = if self.prefix.is_empty() {
            64.min(meta.len()) as usize
        } else {
            self.prefix.len().min(meta.len() as usize)
        };
        let mut first = vec![0; prefix_len];
        file.read_exact(&mut first).map_err(|_| "读取日志失败")?;
        let reset = self.initialized
            && (meta.created().ok() != self.created
                || meta.len() < self.offset
                || first != self.prefix);
        let mut header = vec![];
        if !self.initialized || reset {
            file.seek(SeekFrom::Start(0)).map_err(|_| "读取日志失败")?;
            file.by_ref()
                .take(65536)
                .read_to_end(&mut header)
                .map_err(|_| "读取日志失败")?;
            self.offset = if self.initialized { 0 } else { meta.len() };
            self.initialized = true;
        }
        self.created = meta.created().ok();
        self.prefix = first;
        file.seek(SeekFrom::Start(self.offset))
            .map_err(|_| "定位日志失败")?;
        let mut bytes = vec![];
        file.take(512 * 1024)
            .read_to_end(&mut bytes)
            .map_err(|_| "读取日志失败")?;
        self.offset += bytes.len() as u64;
        Ok((reset, header, bytes))
    }
}
impl Capture {
    pub fn new() -> Self {
        Self(Mutex::new(Runtime {
            parser: Parser::new("live-ee-log", &format!("live-{}", UtcNow::key())),
            latest: None,
            binding: None,
            error: None,
            code: "waiting-account".into(),
            import: None,
        }))
    }
    pub fn start(self: &Arc<Self>, app: tauri::AppHandle) {
        let this = Arc::clone(self);
        std::thread::spawn(move || {
            let path = PathBuf::from(std::env::var_os("LOCALAPPDATA").unwrap_or_default())
                .join("Warframe/EE.log");
            let mut tail = Tail::default();
            let mut last_save = Instant::now();
            let mut previous_status = String::new();
            loop {
                std::thread::sleep(Duration::from_millis(500));
                let binding = app
                    .state::<crate::collector::Collector>()
                    .arbitration_binding();
                let Ok(mut rt) = this.0.lock() else {
                    continue;
                };
                let mut changed = false;
                if rt.binding != binding {
                    rt.parser.interrupt("采集关闭或账户切换");
                    if let Some((scope, _)) = &rt.binding {
                        let state = app.state::<AppState>();
                        if let Ok(db) = state.0.lock() {
                            for r in &rt.parser.finished {
                                if let Err(e) = history::save(&db, scope, r) {
                                    rt.error = Some(e);
                                    break;
                                }
                            }
                        };
                    }
                    rt.parser = Parser::new("live-ee-log", &UtcNow::key());
                    rt.latest=None;
                    rt.binding = binding.clone();
                    tail = Tail::default();
                    changed = true;
                }
                let Some((scope, _)) = binding else {
                    rt.code = "waiting-account".into();
                    continue;
                };
                match tail.poll(&path) {
                    Ok((reset, header, bytes)) => {
                        if reset {
                            rt.parser.reset("日志被截断或轮换");
                            changed = true;
                        }
                        // Bootstrap time anchor only. Old missions and credentials are not replayed into a new account.
                        for line in String::from_utf8_lossy(&header)
                            .lines()
                            .filter(|s| s.contains("Current time:") && s.contains("[UTC:"))
                        {
                            rt.parser.line(line);
                        }
                        let before = rt
                            .parser
                            .active
                            .as_ref()
                            .map(|r| (r.id.clone(), r.status.clone()));
                        rt.parser.feed(&bytes);
                        rt.code = if rt.parser.account_boundary {
                            "waiting-account"
                        } else {
                            "watching"
                        }
                        .into();
                        let after = rt
                            .parser
                            .active
                            .as_ref()
                            .map(|r| (r.id.clone(), r.status.clone()));
                        changed |= before != after;
                        if changed
                            || last_save.elapsed() > Duration::from_secs(2)
                            || !rt.parser.finished.is_empty()
                        {
                            let state = app.state::<AppState>();
                            let result = (|| {
                                let db = state.0.lock().map_err(|_| "数据库锁错误")?;
                                for r in &rt.parser.finished {
                                    history::save(&db, &scope, r)?;
                                }
                                if let Some(r) = &rt.parser.active {
                                    history::save(&db, &scope, r)?;
                                }
                                Ok::<_, String>(())
                            })();
                            match result {
                                Ok(()) => {
                                    if rt.parser.active.as_ref().is_some_and(|r|r.status=="recording"){rt.latest=None;}
                                    else if let Some(ended)=summary_candidate(&rt.parser){rt.latest=Some(ended);}
                                    rt.parser.finished.clear();
                                    rt.error = None;
                                    last_save = Instant::now();
                                    let _ = app.emit("arbitration-updated", ());
                                }
                                Err(e) => {
                                    rt.error = Some(e);
                                    rt.code = "storage-error".into();
                                }
                            }
                        }
                        if changed
                            && rt.error.is_none()
                            && (rt.parser.active.is_some() || rt.latest.is_some())
                        {
                            let state = app.state::<AppState>();
                            let auto = state
                                .0
                                .lock()
                                .ok()
                                .and_then(|db| auto_open(&db).ok())
                                .unwrap_or(true);
                            if auto {
                                drop(rt);
                                let _ = open_live(&app);
                                continue;
                            }
                        }
                    }
                    Err(e) => {
                        rt.error = Some(e);
                        rt.code = "log-unavailable".into();
                    }
                }
                let state = format!("{}:{:?}", rt.code, rt.error);
                if state != previous_status {
                    previous_status = state;
                    let _ = app.emit("arbitration-updated", ());
                }
            }
        });
    }
}
struct UtcNow;
impl UtcNow {
    fn key() -> String {
        chrono::Utc::now()
            .timestamp_nanos_opt()
            .unwrap_or_default()
            .to_string()
    }
}
fn auto_open(db: &crate::store::Store) -> Result<bool, String> {
    use rusqlite::OptionalExtension;
    let value: Option<String> = db
        .db
        .query_row(
            "SELECT value FROM settings WHERE key='arbitration_auto_live'",
            [],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    Ok(value.as_deref() != Some("false"))
}
fn open_live(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("arbitration-live") {
        w.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        "arbitration-live",
        tauri::WebviewUrl::App("index.html?arbitrationLive=1".into()),
    )
    .title("TennoLedger · 实时仲裁")
    .inner_size(1024., 720.)
    .min_inner_size(700., 500.)
    .decorations(false)
    .focused(false)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn arbitration_open_live(app: tauri::AppHandle) -> Result<(), String> {
    open_live(&app)
}
#[tauri::command]
pub fn arbitration_open_report(
    expected_scope: String,
    id: String,
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    {
        let db = state.0.lock().map_err(|_| "数据库锁错误")?;
        db.require_expected_scope(Some(&expected_scope))?;
        history::get(&db, &expected_scope, &id)?.ok_or("仲裁记录不存在")?;
    }
    let label = format!("arbitration-report-{id}");
    if let Some(w) = app.get_webview_window(&label) {
        w.show().map_err(|e| e.to_string())?;
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        label,
        tauri::WebviewUrl::App(format!("index.html?arbitrationLive=1&report={id}").into()),
    )
    .title("TennoLedger · 仲裁报告")
    .inner_size(1024., 720.)
    .min_inner_size(700., 500.)
    .decorations(false)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn arbitration_capture_status(
    expected_scope: String,
    state: tauri::State<AppState>,
    capture: tauri::State<Arc<Capture>>,
) -> Result<Status, String> {
    let rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    let current = if rt
        .binding
        .as_ref()
        .is_some_and(|(scope, _)| scope == &expected_scope)
    {
        rt.parser.active.clone().or_else(||rt.latest.clone())
    } else {
        None
    };
    Ok(Status {
        code: rt.code.clone(),
        error: rt.error.clone(),
        current,
        auto_open: auto_open(&db)?,
    })
}
#[tauri::command]
pub fn arbitration_set_auto_live(
    enabled: bool,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.db.execute("INSERT INTO settings(key,value) VALUES('arbitration_auto_live',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[if enabled{"true"}else{"false"}]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn arbitration_history(
    expected_scope: String,
    filter: history::Filter,
    state: tauri::State<AppState>,
) -> Result<history::Page, String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    history::list(&db, &expected_scope, &filter)
}
#[tauri::command]
pub fn arbitration_run(
    expected_scope: String,
    id: String,
    state: tauri::State<AppState>,
) -> Result<Run, String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    history::get(&db, &expected_scope, &id)?.ok_or("仲裁记录不存在".into())
}
#[tauri::command]
pub fn arbitration_metadata(
    expected_scope: String,
    id: String,
    metadata: Metadata,
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<Run, String> {
    history::validate_metadata(&metadata)?;
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    let mut r = history::get(&db, &expected_scope, &id)?.ok_or("仲裁记录不存在")?;
    r.metadata = metadata;
    db.db
        .execute(
            "UPDATE arbitration_runs SET payload=?1 WHERE scope=?2 AND id=?3",
            rusqlite::params![
                serde_json::to_string(&r).map_err(|e| e.to_string())?,
                expected_scope,
                id
            ],
        )
        .map_err(|e| e.to_string())?;
    let _ = app.emit("arbitration-updated", ());
    Ok(r)
}
#[tauri::command]
pub fn arbitration_delete(
    expected_scope: String,
    id: String,
    state: tauri::State<AppState>,
    capture: tauri::State<Arc<Capture>>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    if rt.parser.active.as_ref().is_some_and(|r| r.id == id)
        && rt
            .binding
            .as_ref()
            .is_some_and(|(s, _)| s == &expected_scope)
    {
        return Err("当前局结束并离开任务后可删除".into());
    }
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    db.db
        .execute(
            "DELETE FROM arbitration_runs WHERE scope=?1 AND id=?2",
            rusqlite::params![expected_scope, id],
        )
        .map_err(|e| e.to_string())?;
    let _ = app.emit("arbitration-updated", ());
    Ok(())
}
#[tauri::command]
pub fn arbitration_node_notes(
    expected_scope: String,
    state: tauri::State<AppState>,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    history::node_notes(&db, &expected_scope)
}
#[tauri::command]
pub fn arbitration_save_node_note(
    expected_scope: String,
    node: String,
    note: String,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    if node.len() > 128 || note.chars().count() > 4000 {
        return Err("节点备注超限".into());
    }
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    db.db.execute("INSERT INTO arbitration_node_notes(scope,node,note) VALUES(?1,?2,?3) ON CONFLICT(scope,node) DO UPDATE SET note=excluded.note",rusqlite::params![expected_scope,node,note]).map_err(|e|e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn arbitration_import_begin(
    expected_scope: String,
    state: tauri::State<AppState>,
    capture: tauri::State<Arc<Capture>>,
) -> Result<String, String> {
    let mut rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    if rt.import.is_some() {
        return Err("已有日志正在导入，请先取消".into());
    }
    let id = UtcNow::key();
    rt.import = Some(Import {
        id: id.clone(),
        scope: expected_scope,
        parser: Parser::new("import-ee-log", &id),
        bytes: 0,
        runs: vec![],
    });
    Ok(id)
}
#[tauri::command]
pub fn arbitration_import_chunk(
    expected_scope: String,
    id: String,
    chunk: String,
    capture: tauri::State<Arc<Capture>>,
    state: tauri::State<AppState>,
) -> Result<ImportProgress, String> {
    let mut rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    let job = rt
        .import
        .as_mut()
        .filter(|j| j.id == id && j.scope == expected_scope)
        .ok_or("导入已取消或账户不一致")?;
    if chunk.len() > 1024 * 1024 || job.bytes + chunk.len() as u64 > 512 * 1024 * 1024 {
        return Err("日志超过导入上限 512MiB".into());
    }
    job.parser.feed(chunk.as_bytes());
    job.bytes += chunk.len() as u64;
    job.runs.append(&mut job.parser.finished);
    if job.runs.len() > 512 {
        return Err("单次导入超过512局".into());
    }
    Ok(ImportProgress {
        id,
        bytes: job.bytes,
        runs: job.runs.len() + usize::from(job.parser.active.is_some()),
        added: 0,
        duplicates: 0,
    })
}
#[tauri::command]
pub fn arbitration_import_cancel(
    id: String,
    capture: tauri::State<Arc<Capture>>,
) -> Result<(), String> {
    let mut rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    if rt.import.as_ref().is_some_and(|j| j.id == id) {
        rt.import = None;
    }
    Ok(())
}
#[tauri::command]
pub fn arbitration_import_finish(
    expected_scope: String,
    id: String,
    capture: tauri::State<Arc<Capture>>,
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<ImportProgress, String> {
    let mut rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    if !rt
        .import
        .as_ref()
        .is_some_and(|j| j.id == id && j.scope == expected_scope)
    {
        return Err("导入已取消或账户不一致".into());
    }
    let mut job = rt.import.take().unwrap();
    job.parser.eof();
    job.runs.append(&mut job.parser.finished);
    if job.runs.is_empty() {
        return Err("日志中没有可识别的仲裁任务".into());
    }
    if job.runs.len() > 512 {
        return Err("单次导入超过512局".into());
    }
    let added = commit_import(&db, &expected_scope, &job.runs)?;
    let _ = app.emit("arbitration-updated", ());
    Ok(ImportProgress {
        id,
        bytes: job.bytes,
        runs: job.runs.len(),
        added,
        duplicates: job.runs.len() - added,
    })
}
fn commit_import(db: &crate::store::Store, scope: &str, runs: &[Run]) -> Result<usize, String> {
    let tx = db.db.unchecked_transaction().map_err(|e| e.to_string())?;
    let mut added = 0;
    for r in runs {
        if history::save(db, scope, r)? {
            added += 1;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(added)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn real_tyanaf_pass_replay_is_saved_once_under_the_bound_account() {
        let mut parser=Parser::new("offline-replay","tyana-sanitized-20261025");
        parser.feed(include_bytes!("../../tests/fixtures/arbitration-tyana.txt"));parser.eof();
        assert_eq!(parser.finished.len(),1);
        let run=&parser.finished[0];assert_eq!(run.node_id,"SolNode450");assert_eq!(run.drone_spawns,2108);assert_eq!(run.reward_cycles,Some(6));
        let scope=crate::account_scope::from_value(&serde_json::json!({"AccountId":"0123456789abcdef01234567"})).unwrap().unwrap();
        let db=crate::store::Store::open(Path::new(":memory:")).unwrap();
        history::save(&db,&scope,run).unwrap();history::save(&db,&scope,run).unwrap();
        assert_eq!(history::all(&db,&scope).unwrap().len(),1);
        assert!(history::all(&db,"legacy-unassigned").unwrap().is_empty());
    }
    #[test]
    fn settlement_survives_leaving_the_mission_but_not_a_new_active_run() {
        let mut parser=Parser::new("test","summary");
        parser.feed(b"10 Script [Info]: Mission name: Hyf (Deimos) - Arbitration\n12 Script [Info]: TopMenu.lua: Abort:\n");
        let ended=summary_candidate(&parser).unwrap();assert_eq!(ended.status,"aborted");
        parser.interrupt("");assert_eq!(summary_candidate(&parser).unwrap().id,ended.id);
        parser.feed(b"20 Script [Info]: Mission name: Hyf (Deimos) - Arbitration\n");
        assert!(summary_candidate(&parser).is_none());
    }
    #[test]
    fn tail_reads_only_new_bytes_and_detects_rewrite() {
        let path = std::env::temp_dir().join(format!("myframe-tail-{}.log", UtcNow::key()));
        std::fs::write(&path, b"0.1 header\n").unwrap();
        let mut t = Tail::default();
        let (_, _, b) = t.poll(&path).unwrap();
        assert!(b.is_empty());
        use std::io::Write;
        std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .unwrap()
            .write_all(b"20 new\n")
            .unwrap();
        let (reset, _, b) = t.poll(&path).unwrap();
        assert!(!reset);
        assert_eq!(b, b"20 new\n");
        std::fs::write(&path, b"0.2 new session with longer data\n").unwrap();
        let (reset, _, b) = t.poll(&path).unwrap();
        assert!(reset);
        assert!(!b.is_empty());
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn chunked_import_is_atomic_and_repeatable() {
        let db = crate::store::Store::open(Path::new(":memory:")).unwrap();
        let mut p = Parser::new("import", "same-file");
        p.feed(b"10 Script [Info]: Mission name: Hyf (Deimos) - Arbitration\n20 Script [Info]: TopMenu.lua: Abort:\n");
        p.eof();
        let run = p.finished[0].clone();
        let mut invalid = run.clone();
        invalid.id = "invalid".into();
        assert!(commit_import(&db, "scope-a", &[run.clone(), invalid]).is_err());
        assert_eq!(history::all(&db, "scope-a").unwrap().len(), 0);
        assert_eq!(commit_import(&db, "scope-a", &[run.clone()]).unwrap(), 1);
        assert_eq!(commit_import(&db, "scope-a", &[run]).unwrap(), 0);
        assert!(history::all(&db, "scope-b").unwrap().is_empty());
    }
    #[test]
    fn appended_log_reaches_persistent_settlement_and_survives_reopen() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("myframe-arby-e2e-{}", UtcNow::key()));
        std::fs::create_dir(&dir).unwrap();
        let log = dir.join("EE.log");
        let database = dir.join("test.sqlite3");
        std::fs::write(
            &log,
            b"0.1 Sys [Diag]: Current time: [UTC: Sat Oct 24 15:09:14 2026]\n",
        )
        .unwrap();
        let mut tail = Tail::default();
        let (_, header, _) = tail.poll(&log).unwrap();
        let mut parser = Parser::new("live-ee-log", "e2e");
        parser.feed(&header);
        let db = crate::store::Store::open(&database).unwrap();
        for text in ["10 Script [Info]: Mission name: Hyf (Deimos) - Arbitration\n10 Script [Info]: Host loading SolNode707_EliteAlert\n11 Game [Info]: OnStateStarted, mission type=MT_DEFENSE\n12 Script [Info]: WaveDefend.lua: Defense wave: 1\n13 AI [Info]: OnAgentCreated /Npc/CorpusEliteShieldDroneAgent1 Live 3 Spawned 1\n","20 Script [Info]: WaveDefend.lua: _SleepBetweenWaves(3)\n22 Script [Info]: TopMenu.lua: Abort:\n"]{std::fs::OpenOptions::new().append(true).open(&log).unwrap().write_all(text.as_bytes()).unwrap();let (_,_,bytes)=tail.poll(&log).unwrap();parser.feed(&bytes);history::save(&db,"legacy-unassigned",parser.active.as_ref().unwrap()).unwrap();}
        let id = parser.active.as_ref().unwrap().id.clone();
        drop(db);
        let db = crate::store::Store::open(&database).unwrap();
        let run = history::get(&db, "legacy-unassigned", &id)
            .unwrap()
            .unwrap();
        assert_eq!(run.status, "aborted");
        assert_eq!(run.waves_completed, 1);
        assert_eq!(run.drone_spawns, 1);
        assert_eq!(run.duration(), Some(10.));
        drop(db);
        std::fs::remove_dir_all(dir).unwrap();
    }
}
