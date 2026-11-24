//! Local log watcher, checkpoints and user-driven streamed imports share one reducer.
use crate::{
    arbitration_history as history,
    arbitration_run::{Metadata, Parser, Run},
    player_identity::LoginIdentity,
    AppState,
};
use serde::Serialize;
use std::{
    fs::File,
    io::{ErrorKind, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime},
};
use tauri::{Emitter, Manager};

#[derive(Debug, PartialEq, Eq)]
enum PollError {
    NotFound,
    Io(String),
}

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
fn can_save_arbitration_runs(
    expected_binding: &(String, u64),
    current_binding: Option<&(String, u64)>,
    account_boundary: bool,
) -> bool {
    !account_boundary && current_binding == Some(expected_binding)
}
fn can_promote_unlinked(
    tail_initialized: bool,
    account_boundary: bool,
    unlinked_login: Option<&LoginIdentity>,
    current_login: Option<&LoginIdentity>,
) -> bool {
    tail_initialized
        && !account_boundary
        && unlinked_login.is_some()
        && unlinked_login == current_login
}
fn visible_for_scope(
    binding: Option<&(String, u64)>,
    unlinked_scope: Option<&str>,
    account_boundary: bool,
    observed_epoch: u64,
    collector_epoch: u64,
    expected_scope: &str,
) -> bool {
    if observed_epoch != collector_epoch {
        return false;
    }
    if let Some((scope, _)) = binding {
        scope == expected_scope
    } else {
        !account_boundary && unlinked_scope == Some(expected_scope)
    }
}
struct Runtime {
    parser: Parser,
    latest: Option<Run>,
    binding: Option<(String, u64)>,
    unlinked_scope: Option<String>,
    unlinked_login: Option<LoginIdentity>,
    observed_epoch: u64,
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
    pub live_window_visible: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LiveWindowWake {
    was_hidden: bool,
    prefer_mini: bool,
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
fn active_tail_after_login(slice: &[u8]) -> &[u8] {
    let mut cut = 0usize;
    let mut pos = 0usize;
    while pos < slice.len() {
        let line_end = slice[pos..]
            .iter()
            .position(|&b| b == b'\n')
            .map_or(slice.len(), |n| pos + n + 1);
        let line = String::from_utf8_lossy(&slice[pos..line_end]);
        if line.contains("LoginDone result=true")
            || crate::account_signals::is_sys_info_event(&line, "Logged in ")
            || crate::account_signals::is_sys_info_event(&line, "Logged out")
        {
            cut = line_end;
        }
        pos = line_end;
    }
    &slice[cut..]
}

fn feed_time_origin(parser: &mut Parser, header: &[u8]) {
    // Bootstrap time anchor only. Old missions and credentials are not replayed into a new account.
    for line in String::from_utf8_lossy(header)
        .lines()
        .filter(|s| s.contains("Current time:") && s.contains("[UTC:"))
    {
        parser.line(line);
    }
}

fn feed_bootstrap(parser: &mut Parser, header: &[u8], bootstrap: &[u8]) -> bool {
    let prior_finished = parser.finished.len();
    feed_time_origin(parser, header);
    if bootstrap.is_empty() {
        return false;
    }
    parser.feed(bootstrap);
    parser.finished.truncate(prior_finished);
    if !parser.active.as_ref().is_some_and(|r| r.status == "recording") {
        parser.active = None;
        return false;
    }
    true
}

#[derive(Default)]
pub struct Tail {
    offset: u64,
    created: Option<SystemTime>,
    initialized: bool,
    prefix: Vec<u8>,
}
impl Tail {
    fn poll_with_bootstrap(
        &mut self,
        path: &Path,
    ) -> Result<(bool, Vec<u8>, Vec<u8>, Vec<u8>), PollError> {
        let mut file = File::open(path).map_err(|e| {
            if e.kind() == ErrorKind::NotFound {
                PollError::NotFound
            } else {
                PollError::Io("无法打开 Warframe EE.log".into())
            }
        })?;
        let meta = file
            .metadata()
            .map_err(|_| PollError::Io("无法读取日志状态".into()))?;
        let prefix_len = if self.prefix.is_empty() {
            64.min(meta.len()) as usize
        } else {
            self.prefix.len().min(meta.len() as usize)
        };
        let mut first = vec![0; prefix_len];
        file.read_exact(&mut first)
            .map_err(|_| PollError::Io("读取日志失败".into()))?;
        let reset = self.initialized
            && (meta.created().ok() != self.created
                || meta.len() < self.offset
                || first != self.prefix);
        let mut header = vec![];
        let mut bootstrap = vec![];
        if !self.initialized || reset {
            file.seek(SeekFrom::Start(0))
                .map_err(|_| PollError::Io("读取日志失败".into()))?;
            file.by_ref()
                .take(65536)
                .read_to_end(&mut header)
                .map_err(|_| PollError::Io("读取日志失败".into()))?;
            const BOOTSTRAP_LIMIT: u64 = 32 * 1024 * 1024;
            let start = meta.len().saturating_sub(BOOTSTRAP_LIMIT);
            file.seek(SeekFrom::Start(start))
                .map_err(|_| PollError::Io("读取日志失败".into()))?;
            let mut tail_buf = vec![];
            file.by_ref()
                .take(BOOTSTRAP_LIMIT)
                .read_to_end(&mut tail_buf)
                .map_err(|_| PollError::Io("读取日志失败".into()))?;
            let aligned = if start > 0 {
                tail_buf
                    .iter()
                    .position(|&b| b == b'\n')
                    .map_or(&tail_buf[tail_buf.len()..], |i| &tail_buf[i + 1..])
            } else {
                &tail_buf[..]
            };
            bootstrap = active_tail_after_login(aligned).to_vec();
            self.offset = meta.len();
            self.initialized = true;
        }
        self.created = meta.created().ok();
        self.prefix = first;
        file.seek(SeekFrom::Start(self.offset))
            .map_err(|_| PollError::Io("定位日志失败".into()))?;
        let mut bytes = vec![];
        file.take(512 * 1024)
            .read_to_end(&mut bytes)
            .map_err(|_| PollError::Io("读取日志失败".into()))?;
        self.offset += bytes.len() as u64;
        Ok((reset, header, bootstrap, bytes))
    }

    pub fn poll(&mut self, path: &Path) -> Result<(bool, Vec<u8>, Vec<u8>), String> {
        let (reset, header, bootstrap, bytes) =
            self.poll_with_bootstrap(path).map_err(|e| match e {
                PollError::NotFound => "未找到 Warframe EE.log".into(),
                PollError::Io(msg) => msg,
            })?;
        Ok((
            reset,
            header,
            if reset && bytes.is_empty() {
                bootstrap
            } else {
                bytes
            },
        ))
    }
}
impl Capture {
    pub fn new() -> Self {
        Self(Mutex::new(Runtime {
            parser: Parser::new("live-ee-log", &format!("live-{}", UtcNow::key())),
            latest: None,
            binding: None,
            unlinked_scope: None,
            unlinked_login: None,
            observed_epoch: 0,
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
            let mut last_emit = Instant::now();
            let mut dirty = false;
            let mut last_auto_opened_id: Option<String> = None;
            let mut previous_status = String::new();
            loop {
                std::thread::sleep(Duration::from_millis(500));
                let arb_state = app
                    .state::<crate::collector::Collector>()
                    .arbitration_state();
                let binding = arb_state.binding.clone();
                let Ok(mut rt) = this.0.lock() else {
                    continue;
                };
                let mut changed = false;
                if rt.binding.is_none() && binding.is_some() {
                    let current_login = crate::player_identity::read(&path);
                    if can_promote_unlinked(
                        tail.initialized,
                        rt.parser.account_boundary,
                        rt.unlinked_login.as_ref(),
                        current_login.as_ref(),
                    ) {
                        rt.binding = binding.clone();
                        rt.unlinked_scope = None;
                        rt.unlinked_login = None;
                        rt.observed_epoch = arb_state.scope_epoch;
                        changed = true;
                        dirty = true;
                    } else {
                        rt.parser = Parser::new("live-ee-log", &UtcNow::key());
                        rt.latest = None;
                        rt.binding = binding.clone();
                        rt.unlinked_scope = None;
                        rt.unlinked_login = None;
                        rt.observed_epoch = arb_state.scope_epoch;
                        tail = Tail::default();
                        dirty = false;
                        last_auto_opened_id = None;
                        changed = true;
                    }
                } else if rt.binding != binding
                    || (rt.binding.is_none()
                        && binding.is_none()
                        && rt.observed_epoch != arb_state.scope_epoch)
                {
                    rt.parser = Parser::new("live-ee-log", &UtcNow::key());
                    rt.latest = None;
                    rt.binding = binding.clone();
                    rt.unlinked_scope = None;
                    rt.unlinked_login = None;
                    rt.observed_epoch = arb_state.scope_epoch;
                    tail = Tail::default();
                    dirty = false;
                    last_auto_opened_id = None;
                    changed = true;
                }
                match tail.poll_with_bootstrap(&path) {
                    Ok((reset, header, bootstrap, bytes)) => {
                        if reset {
                            rt.parser.reset("日志被截断或轮换");
                            rt.unlinked_login = None;
                            dirty = true;
                            last_auto_opened_id = None;
                            changed = true;
                        }
                        if !bootstrap.is_empty() {
                            if feed_bootstrap(&mut rt.parser, &header, &bootstrap) {
                                changed = true;
                                dirty = true;
                            }
                        } else {
                            feed_time_origin(&mut rt.parser, &header);
                        }
                        let before = rt.parser.active.as_ref().map(|r| {
                            (r.id.clone(), r.status.clone(), r.gameplay_start.is_some())
                        });
                        rt.parser.feed(&bytes);
                        let after = rt.parser.active.as_ref().map(|r| {
                            (r.id.clone(), r.status.clone(), r.gameplay_start.is_some())
                        });
                        changed |= before != after;
                        if !bytes.is_empty()
                            && (rt.parser.active.is_some()
                                || !rt.parser.finished.is_empty()
                                || changed)
                        {
                            dirty = true;
                        }
                        if let Some((scope, epoch)) = binding.clone() {
                            if arb_state.game_exiting
                                && bytes.is_empty()
                                && rt
                                    .parser
                                    .active
                                    .as_ref()
                                    .is_some_and(|r| r.status == "recording")
                            {
                                rt.parser.interrupt("游戏已退出");
                                changed = true;
                                dirty = true;
                            }
                            if rt.parser.account_boundary {
                                rt.parser = Parser::new("live-ee-log", &UtcNow::key());
                                rt.latest = None;
                                rt.binding = None;
                                rt.unlinked_scope = None;
                                rt.unlinked_login = None;
                                rt.code = "waiting-account".into();
                                rt.error = None;
                                tail = Tail::default();
                                dirty = false;
                                last_auto_opened_id = None;
                                previous_status = format!("{}:{:?}", rt.code, rt.error);
                                drop(rt);
                                app.state::<crate::collector::Collector>()
                                    .invalidate_if_epoch(&app, epoch);
                                let _ = app.emit("arbitration-updated", ());
                                continue;
                            }
                            rt.code = "watching".into();
                            rt.error = None;
                            if changed
                                || !rt.parser.finished.is_empty()
                                || (dirty
                                    && rt.parser.active.is_some()
                                    && last_save.elapsed() > Duration::from_secs(2))
                            {
                                let expected_binding = (scope.clone(), epoch);
                                let collector = app.state::<crate::collector::Collector>();
                                if !can_save_arbitration_runs(
                                    &expected_binding,
                                    collector.arbitration_binding().as_ref(),
                                    rt.parser.account_boundary,
                                ) {
                                    rt.parser = Parser::new("live-ee-log", &UtcNow::key());
                                    rt.latest = None;
                                    rt.binding = None;
                                    rt.unlinked_scope = None;
                                    rt.unlinked_login = None;
                                    rt.code = "waiting-account".into();
                                    rt.error = None;
                                    tail = Tail::default();
                                    dirty = false;
                                    last_auto_opened_id = None;
                                } else {
                                    let result = collector.with_arbitration_binding(
                                        &app,
                                        &expected_binding,
                                        |db| {
                                            for r in &rt.parser.finished {
                                                history::save(db, &scope, r)?;
                                            }
                                            if let Some(r) = &rt.parser.active {
                                                history::save(db, &scope, r)?;
                                            } else if let Some(r) = &rt.latest {
                                                history::save(db, &scope, r)?;
                                            }
                                            Ok::<_, String>(())
                                        },
                                    );
                                    match result {
                                        Ok(Some(())) => {
                                            if rt
                                                .parser
                                                .active
                                                .as_ref()
                                                .is_some_and(|r| r.status == "recording")
                                            {
                                                rt.latest = None;
                                            } else if let Some(ended) =
                                                summary_candidate(&rt.parser)
                                            {
                                                rt.latest = Some(ended);
                                            }
                                            rt.parser.finished.clear();
                                            rt.error = None;
                                            dirty = false;
                                            last_save = Instant::now();
                                            last_emit = Instant::now();
                                            let _ = app.emit("arbitration-updated", ());
                                        }
                                        Ok(None) => {
                                            rt.parser =
                                                Parser::new("live-ee-log", &UtcNow::key());
                                            rt.latest = None;
                                            rt.binding = None;
                                            rt.unlinked_scope = None;
                                            rt.unlinked_login = None;
                                            rt.code = "waiting-account".into();
                                            rt.error = None;
                                            tail = Tail::default();
                                            dirty = false;
                                            last_auto_opened_id = None;
                                        }
                                        Err(e) => {
                                            rt.error = Some(e);
                                            rt.code = "storage-error".into();
                                        }
                                    }
                                }
                            } else if dirty
                                && rt.parser.active.is_some()
                                && last_emit.elapsed() >= Duration::from_secs(1)
                            {
                                dirty = false;
                                last_emit = Instant::now();
                                let _ = app.emit("arbitration-updated", ());
                            }
                        } else {
                            if rt.unlinked_scope.is_none() {
                                let state = app.state::<AppState>();
                                if let Ok(db) = state.0.lock() {
                                    rt.unlinked_scope = db.active_scope().ok();
                                };
                            }
                            if rt.unlinked_login.is_none() {
                                rt.unlinked_login = crate::player_identity::read(&path);
                            }
                            if rt.parser.account_boundary {
                                rt.parser = Parser::new("live-ee-log", &UtcNow::key());
                                rt.latest = None;
                                rt.unlinked_login = None;
                                tail = Tail::default();
                                dirty = false;
                                last_auto_opened_id = None;
                                changed = true;
                            }
                            rt.code = "live-unlinked".into();
                            rt.error = None;
                            if rt
                                .parser
                                .active
                                .as_ref()
                                .is_some_and(|r| r.status == "recording")
                            {
                                rt.latest = None;
                            } else if let Some(ended) = summary_candidate(&rt.parser) {
                                rt.latest = Some(ended);
                            }
                            rt.parser.finished.clear();
                            if changed
                                || (dirty
                                    && rt.parser.active.is_some()
                                    && last_emit.elapsed() >= Duration::from_secs(1))
                            {
                                dirty = false;
                                last_emit = Instant::now();
                                let _ = app.emit("arbitration-updated", ());
                            }
                        }
                        let auto_open_id = if rt.error.is_none() {
                            rt.parser
                                .active
                                .as_ref()
                                .filter(|r| r.status == "recording")
                                .map(|r| r.id.clone())
                        } else {
                            None
                        };
                        if let Some(run_id) =
                            auto_open_id.filter(|id| last_auto_opened_id.as_ref() != Some(id))
                        {
                            let state = app.state::<AppState>();
                            let auto = state
                                .0
                                .lock()
                                .ok()
                                .and_then(|db| auto_open(&db).ok())
                                .unwrap_or(true);
                            last_auto_opened_id = Some(run_id);
                            let state_sig = format!("{}:{:?}", rt.code, rt.error);
                            if state_sig != previous_status {
                                previous_status = state_sig;
                                let _ = app.emit("arbitration-updated", ());
                            }
                            if auto {
                                drop(rt);
                                let _ = open_live(&app, false, false);
                                continue;
                            }
                        }
                    }
                    Err(PollError::NotFound) => {
                        rt.error = None;
                        rt.code = "log-unavailable".into();
                    }
                    Err(PollError::Io(e)) => {
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
fn is_live_window_visible(app: &tauri::AppHandle) -> bool {
    app.get_webview_window("arbitration-live")
        .is_some_and(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
}
fn open_live(app: &tauri::AppHandle, focus: bool, prefer_mini: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("arbitration-live") {
        let minimized = w.is_minimized().unwrap_or(false);
        let was_hidden = minimized || !w.is_visible().unwrap_or(false);
        if minimized {
            let _ = w.unminimize();
        }
        w.show().map_err(|e| e.to_string())?;
        if focus {
            let _ = w.set_focus();
        }
        let _ = w.emit(
            "arbitration-live-wake",
            LiveWindowWake {
                was_hidden,
                prefer_mini,
            },
        );
        let _ = app.emit("arbitration-updated", ());
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        "arbitration-live",
        tauri::WebviewUrl::App("index.html?arbitrationLive=1&mini=1".into()),
    )
    .title("TennoLedger · 实时仲裁")
    .inner_size(380., 276.)
    .min_inner_size(320., 46.)
    .always_on_top(true)
    .decorations(false)
    .focused(focus)
    .build()
    .map_err(|e| e.to_string())?;
    let _ = app.emit("arbitration-updated", ());
    Ok(())
}
fn hide_live(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("arbitration-live") {
        w.hide().map_err(|e| e.to_string())?;
    }
    let _ = app.emit("arbitration-updated", ());
    Ok(())
}
#[tauri::command]
pub async fn arbitration_open_live(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || open_live(&app, true, true))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn arbitration_hide_live(app: tauri::AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || hide_live(&app))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn arbitration_open_report(
    expected_scope: String,
    id: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    {
        let db = state.0.lock().map_err(|_| "数据库锁错误")?;
        db.require_expected_scope(Some(&expected_scope))?;
        history::get(&db, &expected_scope, &id)?.ok_or("仲裁记录不存在")?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let label = format!("arbitration-report-{id}");
        if let Some(w) = app.get_webview_window(&label) {
            if w.is_minimized().unwrap_or(false) {
                let _ = w.unminimize();
            }
            w.show().map_err(|e| e.to_string())?;
            let _ = w.set_focus();
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
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn arbitration_capture_status(
    expected_scope: String,
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    capture: tauri::State<Arc<Capture>>,
    collector: tauri::State<crate::collector::Collector>,
) -> Result<Status, String> {
    let live_window_visible = is_live_window_visible(&app);
    let rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    let arb_state = collector.arbitration_state();
    let db = state.0.lock().map_err(|_| "数据库锁错误")?;
    db.require_expected_scope(Some(&expected_scope))?;
    let current = if visible_for_scope(
        rt.binding.as_ref(),
        rt.unlinked_scope.as_deref(),
        rt.parser.account_boundary,
        rt.observed_epoch,
        arb_state.scope_epoch,
        &expected_scope,
    ) {
        rt.parser.active.clone().or_else(|| rt.latest.clone())
    } else {
        None
    };
    Ok(Status {
        code: rt.code.clone(),
        error: rt.error.clone(),
        current: current.map(|mut r| {
            r.retained_log.clear();
            r.positions.clear();
            r
        }),
        auto_open: auto_open(&db)?,
        live_window_visible,
    })
}
#[tauri::command]
pub fn arbitration_set_auto_live(
    enabled: bool,
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    {
        let db = state.0.lock().map_err(|_| "数据库锁错误")?;
        db.db.execute("INSERT INTO settings(key,value) VALUES('arbitration_auto_live',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[if enabled{"true"}else{"false"}]).map_err(|e|e.to_string())?;
    }
    let _ = app.emit("arbitration-updated", ());
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
pub async fn arbitration_export_run(expected_scope:String,id:String,format:String,png:Option<Vec<u8>>,window:tauri::WebviewWindow,state:tauri::State<'_,AppState>)->Result<Option<String>,String>{
    let analyzer=format=="analyzer";
    let (content,extension)={let db=state.0.lock().map_err(|_|"数据库锁错误")?;db.require_expected_scope(Some(&expected_scope))?;let mut r=history::get(&db,&expected_scope,&id)?.ok_or("仲裁记录不存在")?;
        match format.as_str(){
            "log"|"analyzer"=>{if r.retained_log.is_empty(){return Err("本局没有保留原始日志".into());}(r.retained_log,"log")},
            "png"=>(String::new(),"png"),
            "json"=>{r.retained_log.clear();(serde_json::to_string_pretty(&r).map_err(|e|e.to_string())?,"json")},
            "text"=>(format!("TennoLedger — Arbitration\n{} ({})\n{}\nStatus: {}\nDuration: {:?} s\nDrones: {}\nWaves: {}\nRole: {}\nNotes: {}\n",r.node,r.planet,r.mission_type,r.status,r.duration(),r.drone_spawns,r.waves_completed,r.metadata.role,r.metadata.notes),"txt"),
            _=>return Err("未知导出格式".into())
        }
    };
    let image=if format=="png"{let bytes=png.ok_or("缺少报告图像")?;if bytes.len()>8*1024*1024||!bytes.starts_with(b"\x89PNG\r\n\x1a\n"){return Err("报告图像无效".into());}Some(bytes)}else{None};
    if analyzer {crate::arbitration_analyzer::open(content)?;return Ok(Some("arbi.guide".into()));}
    #[cfg(windows)]let owner=window.hwnd().map_err(|_|"无法获取窗口")?.0 as usize;
    #[cfg(not(windows))]let owner=0usize;
    tauri::async_runtime::spawn_blocking(move||{let name=format!("TennoLedger-{id}.{extension}");let Some(path)=crate::save_dialog::choose(owner,&name)?else{return Ok(None)};if let Some(bytes)=image{crate::backup::write_bytes(&path,&bytes)?;}else{crate::backup::write(&path,&content)?;}Ok(Some(path.to_string_lossy().into_owned()))}).await.map_err(|e|e.to_string())?
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
    let mut rt = capture.0.lock().map_err(|_| "采集锁错误")?;
    if rt
        .parser
        .active
        .as_ref()
        .is_some_and(|r| r.id == id && r.status == "recording")
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
    if rt.latest.as_ref().is_some_and(|r| r.id == id) {
        rt.latest = None;
    }
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
        let run=&parser.finished[0];assert_eq!(run.node_id,"SolNode450");assert_eq!(run.mission_type,"Mirror Defense");assert_eq!(run.waves_completed,20);assert_eq!(run.drone_spawns,2108);assert_eq!(run.reward_cycles,Some(10));
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
    #[test]
    fn arbitration_save_guard_rejects_epoch_mismatch_and_account_boundary() {
        let expected = ("acct-v1-a".to_string(), 3u64);
        assert!(can_save_arbitration_runs(&expected, Some(&expected), false));
        assert!(!can_save_arbitration_runs(&expected, Some(&expected), true));
        assert!(!can_save_arbitration_runs(&expected, Some(&("acct-v1-a".into(), 4)), false));
        assert!(!can_save_arbitration_runs(&expected, Some(&("acct-v1-b".into(), 3)), false));
        assert!(!can_save_arbitration_runs(&expected, None, false));
    }
    #[test]
    fn bootstrap_recovers_only_active_run_after_latest_login_boundary() {
        let path = std::env::temp_dir().join(format!("myframe-arby-boot-{}.log", UtcNow::key()));
        let log = concat!(
            "0.021 Sys [Diag]: Current time: Sat Oct 24 23:09:14 2026 [UTC: Sat Oct 24 15:09:14 2026]\n",
            "10.0 Script [Info]: ThemedSquadOverlay.lua: Mission name: OldRun (Earth) - Arbitration\n",
            "11.0 Script [Info]: Host loading SolNode1_EliteAlert\n",
            "12.0 Game [Info]: OnStateStarted, mission type=MT_DEFENSE\n",
            "20.0 Script [Info]: MainMenu::LoginDone result=true\n",
            "30.0 Script [Info]: ThemedSquadOverlay.lua: Mission name: FinishedAfterLogin (Mars) - Arbitration\n",
            "31.0 Script [Info]: Host loading SolNode2_EliteAlert\n",
            "32.0 Game [Info]: OnStateStarted, mission type=MT_DEFENSE\n",
            "40.0 Script [Info]: TopMenu.lua: Abort:\n",
            "50.0 Script [Info]: ThemedSquadOverlay.lua: Mission name: Hyf (火卫二) - 仲裁\n",
            "51.0 Script [Info]: Host loading SolNode707_EliteAlert\n",
            "52.0 Game [Info]: OnStateStarted, mission type=MT_DEFENSE\n",
            "55.0 Script [Info]: WaveDefend.lua: Defense wave: 1\n",
            "70.0 Script [Info]: WaveDefend.lua: _SleepBetweenWaves(3)\n",
            "73.0 Script [Info]: WaveDefend.lua: Defense wave: 2\n",
        );
        std::fs::write(&path, log).unwrap();
        let mut tail = Tail::default();
        let (reset, header, bootstrap, bytes) = tail.poll_with_bootstrap(&path).unwrap();
        assert!(!reset);
        assert!(bytes.is_empty());
        let mut parser = Parser::new("live-ee-log", "boot-test");
        assert!(feed_bootstrap(&mut parser, &header, &bootstrap));
        assert!(parser.finished.is_empty());
        assert!(!parser.account_boundary);
        let run = parser.active.as_ref().unwrap();
        assert_eq!(run.status, "recording");
        assert_eq!(run.node_id, "SolNode707");
        assert_eq!(run.mission_type, "Defense");
        assert_eq!(run.gameplay_start, Some(55.0));
        assert_eq!(run.waves_completed, 1);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn status_serializes_live_window_visibility_camel_case() {
        let status = Status {
            code: "watching".into(),
            error: None,
            current: None,
            auto_open: true,
            live_window_visible: true,
        };
        let value = serde_json::to_value(&status).unwrap();
        assert_eq!(value["code"], "watching");
        assert_eq!(value["autoOpen"], true);
        assert_eq!(value["liveWindowVisible"], true);
    }
    #[test]
    fn reset_bootstrap_strips_pre_login_boundary_and_recovers_active_run() {
        let path = std::env::temp_dir().join(format!("myframe-arby-reset-{}.log", UtcNow::key()));
        std::fs::write(
            &path,
            "0.021 Sys [Diag]: Current time: Sat Oct 24 23:09:14 2026 [UTC: Sat Oct 24 15:09:14 2026]\n",
        )
        .unwrap();
        let mut tail = Tail::default();
        let (reset, _, _, _) = tail.poll_with_bootstrap(&path).unwrap();
        assert!(!reset);

        let truncated = concat!(
            "0.021 Sys [Diag]: Current time: Sat Oct 24 23:20:00 2026 [UTC: Sat Oct 24 15:20:00 2026]\n",
            "15.0 Script [Info]: MainMenu::LoginDone result=true\n",
            "20.0 Sys [Info]: Logged in TennoTest (id)\n",
            "50.0 Script [Info]: ThemedSquadOverlay.lua: Mission name: Hyf (火卫二) - 仲裁\n",
            "51.0 Script [Info]: Host loading SolNode707_EliteAlert\n",
            "52.0 Game [Info]: OnStateStarted, mission type=MT_DEFENSE\n",
            "55.0 Script [Info]: WaveDefend.lua: Defense wave: 1\n",
        );
        std::fs::write(&path, truncated).unwrap();
        let (reset, header, bootstrap, bytes) = tail.poll_with_bootstrap(&path).unwrap();
        assert!(reset);
        assert!(bytes.is_empty());

        let mut parser = Parser::new("live-ee-log", "reset-test");
        assert!(feed_bootstrap(&mut parser, &header, &bootstrap));
        assert!(!parser.account_boundary);
        let run = parser.active.as_ref().unwrap();
        assert_eq!(run.status, "recording");
        assert_eq!(run.node_id, "SolNode707");
        assert_eq!(run.gameplay_start, Some(55.0));
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn feed_bootstrap_preserves_pre_reset_interrupted_run() {
        let mut p = Parser::new("live-ee-log", "reset-preserve");
        p.line("10.0 Script [Info]: Host loading SolNode707_EliteAlert");
        p.line("12.0 Game [Info]: OnStateStarted, mission type=MT_DEFENSE");
        p.line("15.0 Script [Info]: WaveDefend.lua: Defense wave: 1");
        p.reset("日志被截断或轮换");
        assert_eq!(p.finished.len(), 1);
        assert_eq!(p.finished[0].status, "interrupted");

        let new_session = concat!(
            "20.0 Script [Info]: Host loading SolNode1_EliteAlert\n",
            "25.0 Script [Info]: TopMenu.lua: Abort:\n",
            "50.0 Script [Info]: Host loading SolNode450_EliteAlert\n",
            "52.0 Game [Info]: OnStateStarted, mission type=MT_MIRROR_DEFENSE\n",
        );
        let active = feed_bootstrap(
            &mut p,
            b"0.021 Sys [Diag]: Current time: [UTC: Sun Oct 25 00:59:21 2026]\n",
            new_session.as_bytes(),
        );
        assert!(active);
        assert_eq!(p.finished.len(), 1);
        assert_eq!(p.finished[0].node_id, "SolNode707");
        assert_eq!(p.active.as_ref().unwrap().node_id, "SolNode450");
    }
    #[test]
    fn poll_missing_file_returns_not_found_without_io_error() {
        let missing =
            std::env::temp_dir().join(format!("myframe-missing-{}.log", UtcNow::key()));
        let mut t = Tail::default();
        assert_eq!(t.poll_with_bootstrap(&missing), Err(PollError::NotFound));
    }
    #[test]
    fn unlinked_promotion_requires_matching_confirmed_login_and_no_boundary() {
        let dir = std::env::temp_dir().join(format!("myframe-arby-promo-{}", UtcNow::key()));
        std::fs::create_dir(&dir).unwrap();
        let p_a = dir.join("a.log");
        let p_b = dir.join("b.log");
        std::fs::write(&p_a, b"1.0 Sys [Info]: Logged in TennoA (account)\n").unwrap();
        std::fs::write(&p_b, b"2.0 Sys [Info]: Logged in TennoB (account)\n").unwrap();
        let id_a = crate::player_identity::read(&p_a).unwrap();
        let id_b = crate::player_identity::read(&p_b).unwrap();
        std::fs::remove_dir_all(&dir).unwrap();

        assert!(can_promote_unlinked(true, false, Some(&id_a), Some(&id_a)));
        assert!(!can_promote_unlinked(
            false,
            false,
            Some(&id_a),
            Some(&id_a)
        ));
        assert!(!can_promote_unlinked(true, true, Some(&id_a), Some(&id_a)));
        assert!(!can_promote_unlinked(true, false, None, Some(&id_a)));
        assert!(!can_promote_unlinked(
            true,
            false,
            Some(&id_a),
            Some(&id_b)
        ));
    }
    #[test]
    fn status_visibility_isolates_unlinked_runs_by_scope_and_boundary() {
        let binding = ("acct-a".to_string(), 2u64);
        assert!(visible_for_scope(Some(&binding), None, false, 2, 2, "acct-a"));
        assert!(!visible_for_scope(Some(&binding), None, false, 2, 2, "acct-b"));
        assert!(!visible_for_scope(Some(&binding), None, false, 2, 3, "acct-a"));

        assert!(visible_for_scope(None, Some("acct-a"), false, 3, 3, "acct-a"));
        assert!(!visible_for_scope(None, Some("acct-a"), false, 3, 3, "acct-b"));
        assert!(!visible_for_scope(None, Some("acct-a"), true, 3, 3, "acct-a"));
        assert!(!visible_for_scope(None, Some("acct-a"), false, 3, 4, "acct-a"));
    }
}
