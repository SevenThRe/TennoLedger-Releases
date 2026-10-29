#[path="world_rewards.rs"]
pub mod rewards;
#[path="arbitration.rs"]
mod arbitration;
use chrono::{DateTime, Utc};
use reqwest::blocking::Client;
use rusqlite::{params, Connection,OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Read,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter,Manager};
const WORLD_URL: &str = "https://api.warframe.com/cdn/worldState.php";
const ARBY_URL: &str = "https://browse.wf/arbys.txt";
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub kind: String,
    pub node_id: String,
    pub node: String,
    pub planet: String,
    pub mission_type: String,
    pub faction: String,
    pub tier: Option<String>,
    pub steel_path: bool,
    #[serde(default)]
    pub void_storm: bool,
    pub activation: String,
    pub expiry: String,
    pub rewards: Vec<String>,
    pub rating: Option<String>,
    pub predicted: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Cycle {
    pub id: String,
    pub name: String,
    pub state: String,
    pub next_state: String,
    pub expiry: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: String,
    pub r#type: String,
    pub mode: String,
    pub location: String,
    pub steel_path: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub fissure_enabled: bool,
    #[serde(default)]
    pub fissure_all: bool,
    pub fissure_rules: Vec<Rule>,
    pub alert_enabled: bool,
    pub alert_rewards: Vec<String>,
    pub arbitration_enabled: bool,
    pub arbitration_tiers: Vec<String>,
    pub arbitration_nodes: Vec<String>,
    pub arbitration_preferences: Option<arbitration::Preferences>,
    pub cycle_states: Vec<String>,
    pub timer_lead_minutes: u32,
    pub reward_preferences: rewards::Preferences,
    pub delivery: crate::world_notify::DeliverySettings,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            fissure_enabled: false,
            fissure_all: false,
            fissure_rules: vec![],
            alert_enabled: false,
            alert_rewards: vec![],
            arbitration_enabled: false,
            arbitration_tiers: vec!["S".into(), "A".into()],
            arbitration_nodes: vec![],
            arbitration_preferences: None,
            cycle_states: vec![],
            timer_lead_minutes: 3,
            reward_preferences: Default::default(),
            delivery: Default::default(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notice {
    pub id: String,
    pub title: String,
    pub body: String,
    pub created_at: String,
    pub kind: String,
    #[serde(default)]
    pub delivery_error: Option<String>,
    #[serde(default)]
    pub system_state: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub url: String,
    pub fetched_at: Option<String>,
    pub error: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub updated_at: Option<String>,
    pub error: Option<String>,
    pub stale: bool,
    pub fissures: Vec<Event>,
    pub alerts: Vec<Event>,
    pub arbitrations: Vec<Event>,
    pub cycles: Vec<Cycle>,
    #[serde(default)]
    pub reward_missions: Vec<rewards::RewardMission>,
    #[serde(default)]
    pub circuit: Vec<Value>,
    #[serde(default)]
    pub void_traders: Vec<Value>,
    #[serde(default)]
    pub prime_vault_traders: Vec<Value>,
    pub subscriptions: Settings,
    pub notifications: Vec<Notice>,
    pub sources: Vec<Source>,
}
impl Default for Status {
    fn default() -> Self {
        Self {
            updated_at: None,
            error: None,
            stale: true,
            fissures: vec![],
            alerts: vec![],
            arbitrations: vec![],
            cycles: vec![],
            reward_missions: vec![],
            circuit: vec![],
            void_traders: vec![],
            prime_vault_traders: vec![],
            subscriptions: Settings::default(),
            notifications: vec![],
            sources: vec![
                Source {
                    id: "official".into(),
                    url: WORLD_URL.into(),
                    fetched_at: None,
                    error: None,
                },
                Source {
                    id: "arbitration-schedule".into(),
                    url: ARBY_URL.into(),
                    fetched_at: None,
                    error: None,
                },
            ],
        }
    }
}
fn db(path: &PathBuf) -> Result<Connection, String> {
    let c = Connection::open(path).map_err(|e| e.to_string())?;
    c.busy_timeout(Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    c.execute_batch("CREATE TABLE IF NOT EXISTS world_preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS world_seen(id TEXT PRIMARY KEY,last_seen INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS world_notices(id TEXT PRIMARY KEY,payload TEXT NOT NULL);CREATE TABLE IF NOT EXISTS world_cache(key TEXT PRIMARY KEY,payload TEXT NOT NULL,fetched_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS world_external_receipts(id TEXT PRIMARY KEY,payload TEXT NOT NULL);").map_err(|e|e.to_string())?;
    Ok(c)
}
fn preference(c: &Connection, key: &str) -> Option<String> {
    c.query_row(
        "SELECT value FROM world_preferences WHERE key=?",
        [key],
        |r| r.get(0),
    )
    .ok()
}
pub struct WorldService {
    path: PathBuf,
    status: Mutex<Status>,
    observed: Mutex<BTreeSet<String>>,
    stop: AtomicBool,
    running: AtomicBool,
    last_test: Mutex<Option<std::time::Instant>>,
}
impl WorldService {
    pub fn new(path: PathBuf) -> Result<Self, String> {
        let c = db(&path)?;
        let mut status = c
            .query_row(
                "SELECT payload FROM world_cache WHERE key='status'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
            .and_then(|s| serde_json::from_str::<Status>(&s).ok())
            .unwrap_or_default();
        status.stale = true;
        if let Some(p) = preference(&c, "settings") {
            status.subscriptions = serde_json::from_str(&p).unwrap_or_default();
        }
        status.subscriptions.delivery.webhook_configured=preference(&c,"webhook_protected").is_some();
        let mut q = c
            .prepare("SELECT payload FROM world_notices ORDER BY rowid DESC LIMIT 100")
            .map_err(|e| e.to_string())?;
        status.notifications = q
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(Result::ok)
            .filter_map(|p| serde_json::from_str(&p).ok())
            .collect();
        Ok(Self {
            path,
            status: Mutex::new(status),
            observed: Mutex::new(BTreeSet::new()),
            stop: AtomicBool::new(false),
            running: AtomicBool::new(false),
            last_test: Mutex::new(None),
        })
    }
    pub fn try_notice_status(&self)->Option<Status>{self.status.try_lock().ok().map(|status|status.clone())}
    pub fn status(&self) -> Status {
        let mut result = self
            .status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone();
        let now = Utc::now().timestamp();
        for c in &mut result.cycles {
            if let Ok(expiry) = DateTime::parse_from_rfc3339(&c.expiry) {
                if expiry.timestamp() <= now {
                    let duration = |state: &str| match (c.id.as_str(), state) {
                        ("earth", _) => 14400,
                        ("cetus", "day") | ("cambion", "fass") => 6000,
                        ("cetus", "night") | ("cambion", "vome") => 3000,
                        ("vallis", "warm") => 400,
                        ("vallis", "cold") => 1200,
                        _ => 0,
                    };
                    let a = duration(&c.next_state);
                    let b = duration(&c.state);
                    if a > 0 && b > 0 {
                        *c = phase(
                            now,
                            expiry.timestamp(),
                            &[(&c.next_state, a), (&c.state, b)],
                            &c.id,
                            &c.name,
                        );
                    }
                }
            }
        }
        result
    }
    pub fn set_subscriptions(&self,mut settings:Settings)->Result<Status,String>{
        validate_settings(&settings)?;let mut shared=self.status.lock().map_err(|_|"世界状态锁失败")?;let mut c=db(&self.path)?;
        let existing=preference(&c,"webhook_protected");
        let protected=if settings.delivery.clear_webhook{None}else if !settings.delivery.webhook_url.is_empty(){Some(crate::world_notify::protect_webhook(&settings.delivery.webhook_url)?)}else{existing};
        if settings.delivery.webhook_enabled&&protected.is_none(){return Err("请先显式配置 Webhook，再开启 Discord 通知".into());}
        settings.delivery.webhook_configured=protected.is_some();settings.delivery.webhook_url.clear();settings.delivery.clear_webhook=false;
        let tx=c.transaction().map_err(|e|e.to_string())?;
        if let Some(cipher)=protected{tx.execute("INSERT OR REPLACE INTO world_preferences VALUES('webhook_protected',?)",[cipher]).map_err(|_|"无法保存受保护密钥")?;}else{tx.execute("DELETE FROM world_preferences WHERE key='webhook_protected'",[]).map_err(|_|"无法删除密钥")?;}
        tx.execute("INSERT OR REPLACE INTO world_preferences VALUES('settings',?)",[serde_json::to_string(&settings).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;tx.commit().map_err(|e|e.to_string())?;
        shared.subscriptions=settings;drop(shared);Ok(self.status())
    }
    pub fn publish_notice(&self,app:&tauri::AppHandle,notice:Notice)->Result<Notice,String>{
        self.publish_notice_with(notice,|notice,settings,endpoint|crate::world_notify::deliver_configured(app,notice,settings,endpoint,false))
    }
    pub fn status_for_scope(&self,scope:&str)->Status{let mut status=self.status();status.notifications.retain(|notice|crate::world_notify::notice_visible(&notice.id,scope));status}
    pub fn publish_conversation(&self,app:&tauri::AppHandle,id:String,scope:&str,player:&str)->Result<(),String>{
        {let state=app.state::<crate::AppState>();let db=state.0.lock().map_err(|_|"数据库锁错误")?;db.require_expected_scope(Some(scope))?;}
        let settings=self.status().subscriptions.delivery;let Some(notice)=conversation_notice(&id,scope,player,&settings)?else{return Ok(());};
        self.publish_notice_with(notice,|notice,settings,endpoint|crate::world_notify::deliver_configured(app,notice,settings,endpoint,false)).map(|_|())
    }
    fn publish_notice_with(&self,mut notice:Notice,deliver:impl FnOnce(&Notice,&crate::world_notify::DeliverySettings,Option<&str>)->Result<(),String>)->Result<Notice,String>{
        if !(notice.kind=="riven-monitor"&&notice.id.starts_with("riven-monitor:")||notice.kind=="conversation"&&notice.id.starts_with("conversation:"))||notice.id.len()>256||notice.id.chars().any(char::is_control)||notice.title.is_empty()||notice.title.len()>500||notice.body.len()>6000||notice.title.chars().any(char::is_control)||notice.body.chars().any(|c|c.is_control()&&c!='\n'&&c!='\t'){return Err("通知回执字段无效".into());}
        let mut shared=self.status.lock().map_err(|_|"世界状态锁失败")?;
        if notice.kind=="conversation"&&(!shared.subscriptions.delivery.conversation_enabled||shared.subscriptions.delivery.conversation_template.is_empty()){return Err("游戏会话提醒已关闭".into());}
        let c=db(&self.path)?;
        let previous:Option<String>=c.query_row("SELECT payload FROM world_external_receipts WHERE id=?",[&notice.id],|row|row.get(0)).optional().map_err(|e|e.to_string())?;
        if let Some(previous)=previous{return serde_json::from_str(&previous).map_err(|_|"通知回执损坏".into());}
        notice.created_at=Utc::now().to_rfc3339();notice.delivery_error=Some("投递尚未确认；相同回执不会自动重发".into());
        c.execute("INSERT INTO world_external_receipts VALUES(?,?)",params![notice.id,serde_json::to_string(&notice).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;
        let endpoint=preference(&c,"webhook_protected").and_then(|cipher|crate::world_notify::reveal_webhook(&cipher).ok());
        notice.system_state=Some(crate::world_notify::policy_state(&shared.subscriptions.delivery));notice.delivery_error=deliver(&notice,&shared.subscriptions.delivery,endpoint.as_deref()).err();
        let payload=serde_json::to_string(&notice).map_err(|e|e.to_string())?;
        c.execute("UPDATE world_external_receipts SET payload=? WHERE id=?",params![payload,notice.id]).map_err(|e|e.to_string())?;
        c.execute("INSERT OR REPLACE INTO world_notices VALUES(?,?)",params![notice.id,payload]).map_err(|e|e.to_string())?;
        shared.notifications.retain(|entry|entry.id!=notice.id);shared.notifications.insert(0,notice.clone());shared.notifications.truncate(100);Ok(notice)
    }
    pub fn deliver_notice(&self,app:&tauri::AppHandle,notice:&Notice)->Result<(),String>{
        let settings=self.status().subscriptions.delivery;
        let endpoint=db(&self.path).ok().and_then(|c|preference(&c,"webhook_protected")).and_then(|cipher|crate::world_notify::reveal_webhook(&cipher).ok());
        crate::world_notify::deliver_configured(app,notice,&settings,endpoint.as_deref(),notice.kind=="test")
    }
    pub fn test_notification(&self, app: &tauri::AppHandle) -> Result<Notice, String> {
        let settings=self.status().subscriptions.delivery;
        self.test_notification_with(|notice|crate::world_notify::deliver_configured(app,notice,&settings,None,true))
    }
    pub fn notification_failure(&self, id: &str, error: String) -> Result<Notice, String> {
        let mut shared = self.status.lock().map_err(|_| "世界状态锁失败")?;
        let notice = shared
            .notifications
            .iter_mut()
            .find(|n| n.id == id)
            .ok_or("提醒已过期")?;
        notice.delivery_error = Some(error);
        let result = notice.clone();
        db(&self.path)?
            .execute(
                "UPDATE world_notices SET payload=? WHERE id=?",
                params![
                    serde_json::to_string(&result).map_err(|e| e.to_string())?,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
        Ok(result)
    }
    fn test_notification_with(
        &self,
        deliver: impl FnOnce(&Notice) -> Result<(), String>,
    ) -> Result<Notice, String> {
        let mut last = self.last_test.lock().map_err(|_| "测试提醒锁失败")?;
        if last.is_some_and(|at| at.elapsed() < Duration::from_secs(10)) {
            return Err("请稍后再测试提醒".into());
        }
        *last = Some(std::time::Instant::now());
        drop(last);
        let now = Utc::now();
        let mut notice = Notice {
            id: format!(
                "notification-test-{}-{}",
                std::process::id(),
                now.timestamp_nanos_opt().unwrap_or(now.timestamp_micros())
            ),
            title: "TennoLedger · 天诺手账 测试提醒".into(),
            body: "这是一条测试消息，可在“计时与警报 → 提醒记录”查看。".into(),
            created_at: now.to_rfc3339(),
            kind: "test".into(),
            delivery_error: None,
            system_state: None,
        };
        // Serialize with refresh so its earlier network snapshot cannot erase this history entry.
        let mut shared = self.status.lock().map_err(|_| "世界状态锁失败")?;
        let c = db(&self.path)?;
        notice.system_state = Some(crate::world_notify::policy_state(&shared.subscriptions.delivery));
        notice.delivery_error = deliver(&notice).err();
        c.execute(
            "INSERT INTO world_notices VALUES(?,?)",
            params![
                notice.id,
                serde_json::to_string(&notice).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
        c.execute("DELETE FROM world_notices WHERE rowid NOT IN (SELECT rowid FROM world_notices ORDER BY rowid DESC LIMIT 100)", []).map_err(|e|e.to_string())?;
        shared.notifications.insert(0, notice.clone());
        shared.notifications.truncate(100);
        Ok(notice)
    }
    pub fn start(self: &Arc<Self>, app: tauri::AppHandle) {
        if self.running.swap(true, Ordering::SeqCst) {
            return;
        }
        self.stop.store(false, Ordering::SeqCst);
        let service = Arc::clone(self);
        std::thread::spawn(move || {
            while !service.stop.load(Ordering::SeqCst) {
                let _ = service.refresh(Some(&app));
                for _ in 0..300 {
                    if service.stop.load(Ordering::SeqCst) {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(100));
                }
            }
            service.running.store(false, Ordering::SeqCst);
        });
    }
    pub fn stop(&self) {
        self.stop.store(true, Ordering::SeqCst);
    }
    pub fn refresh_once(&self) -> Result<Status, String> {
        self.refresh(None)
    }
    fn refresh(&self, app: Option<&tauri::AppHandle>) -> Result<Status, String> {
        let now = Utc::now().timestamp();
        let client = Client::builder()
            .user_agent("MyFrame/0.1.0 public-world-state")
            .no_proxy()
            .timeout(Duration::from_secs(15))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        let mut reward_missions=None;
        let mut circuit = None;
        let mut void_traders = None;
        let mut prime_vault_traders = None;
        let response = fetch(&client, WORLD_URL, 4 * 1024 * 1024)
            .and_then(|body| {
                serde_json::from_str::<Value>(&body).map_err(|_| "官方世界状态JSON无效".to_string())
            })
            .and_then(|raw| {
                let server_time = raw["Time"].as_i64().ok_or("官方世界状态缺少时间戳")?;
                if now.abs_diff(server_time) > 300 {
                    return Err("官方世界状态已过期；保留上次数据".into());
                }
                let parsed = parse_official(&raw, now)?;
                reward_missions=Some(rewards::parse(&raw,now));
                prime_vault_traders = Some(raw["PrimeVaultTraders"].as_array().cloned().unwrap_or_default());
                void_traders = Some(raw["VoidTraders"].as_array().cloned().unwrap_or_default());
                circuit = Some(raw["EndlessXpSchedule"].as_array().cloned().unwrap_or_default());
                Ok(parsed)
            });
        let mut current = self.status();
        if current.sources.len() != 2 {
            current.sources = Status::default().sources;
        }
        let mut connection = db(&self.path)?;
        apply_official(&mut current, response, now);
        if let Some(rewards)=reward_missions{current.reward_missions=rewards;}
        if let Some(schedule) = circuit { current.circuit = schedule; }
        if let Some(traders) = void_traders { current.void_traders = traders; }
        if let Some(traders) = prime_vault_traders { current.prime_vault_traders = traders; }
        let cached: Option<(String, i64)> = connection
            .query_row(
                "SELECT payload,fetched_at FROM world_cache WHERE key='arbitration'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        let mut schedule = cached
            .as_ref()
            .map(|(body, _)| body.clone())
            .unwrap_or_else(|| include_str!("../../public/arbitration-schedule.txt").into());
        if let Some((_,at))=&cached {current.sources[1].fetched_at=Some(iso(*at));}
        let last_attempt = connection
            .query_row(
                "SELECT fetched_at FROM world_cache WHERE key='arbitration-attempt'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .ok()
            .unwrap_or(0);
        if cached.as_ref().is_none_or(|(_, at)| now - at >= 86400) && now - last_attempt >= 3600 {
            connection
                .execute(
                    "INSERT OR REPLACE INTO world_cache VALUES('arbitration-attempt','',?)",
                    [now],
                )
                .map_err(|e| e.to_string())?;
            match fetch(&client, ARBY_URL, 4 * 1024 * 1024) {
                Ok(body) => match parse_schedule(&body, now) {
                    Ok(events) if !events.is_empty() => {
                        schedule = body;
                        connection
                            .execute(
                                "INSERT OR REPLACE INTO world_cache VALUES('arbitration',?,?)",
                                params![schedule, now],
                            )
                            .map_err(|e| e.to_string())?;
                        current.sources[1].fetched_at = Some(iso(now));
                        current.sources[1].error = None;
                    }
                    _ => {
                        current.sources[1].error =
                            Some("远端排期未覆盖当前时间，使用已保存排期".into())
                    }
                },
                Err(error) => current.sources[1].error = Some(error),
            }
        } else if let Some((_, at)) = cached.as_ref() {
            current.sources[1].fetched_at = Some(iso(*at));
        }
        match parse_schedule(&schedule, now) {
            Ok(events) => {
                current.arbitrations = events;
                if current.arbitrations.is_empty() {
                    current.sources[1].error = Some("仲裁排期未覆盖未来七日".into());
                }
            }
            Err(error) => current.sources[1].error = Some(error),
        }
        if self.stop.load(Ordering::SeqCst) {
            return Ok(current);
        }
        let mut shared = self.status.lock().map_err(|_| "世界状态锁失败")?;
        current.subscriptions = shared.subscriptions.clone();
        current.notifications = shared.notifications.clone();
        // Each provider has its own first-load baseline; stale official data cannot create pushes.
        let notices = observe(
            &mut connection,
            &current,
            now,
            &mut *self.observed.lock().map_err(|_| "提醒状态锁失败")?,
        )?;
        for mut notice in notices {
            notice.system_state = app.map(|_| crate::world_notify::policy_state(&current.subscriptions.delivery));
            notice.delivery_error =
                app.and_then(|app|{let endpoint=preference(&connection,"webhook_protected").and_then(|cipher|crate::world_notify::reveal_webhook(&cipher).ok());crate::world_notify::deliver_configured(app,&notice,&current.subscriptions.delivery,endpoint.as_deref(),false).err()});
            connection
                .execute(
                    "INSERT OR REPLACE INTO world_notices VALUES(?,?)",
                    params![
                        notice.id,
                        serde_json::to_string(&notice).map_err(|e| e.to_string())?
                    ],
                )
                .map_err(|e| e.to_string())?;
            current.notifications.insert(0, notice);
        }
        current.notifications.truncate(100);
        connection
            .execute(
                "INSERT OR REPLACE INTO world_cache VALUES('status',?,?)",
                params![
                    serde_json::to_string(&current).map_err(|e| e.to_string())?,
                    now
                ],
            )
            .map_err(|e| e.to_string())?;
        *shared = current.clone();
        drop(shared);
        if let Some(app) = app {
            let _ = app.emit("world-updated", &current);
        }
        Ok(current)
    }
}
fn apply_official(
    current: &mut Status,
    response: Result<(Vec<Event>, Vec<Event>, Vec<Cycle>), String>,
    now: i64,
) {
    match response {
        Ok((fissures, alerts, cycles)) => {
            current.fissures = fissures;
            current.alerts = alerts;
            current.cycles = cycles;
            current.updated_at = Some(iso(now));
            current.stale = false;
            current.error = None;
            current.sources[0].fetched_at = Some(iso(now));
            current.sources[0].error = None;
        }
        Err(error) => {
            current.stale = true;
            current.error = Some(error.clone());
            current.sources[0].error = Some(error);
        }
    }
}

fn fetch(client: &Client, url: &str, limit: u64) -> Result<String, String> {
    let response = client
        .get(url)
        .send()
        .map_err(|_| "世界状态网络请求失败")?
        .error_for_status()
        .map_err(|_| "世界状态服务返回错误")?;
    if response.content_length().is_some_and(|n| n > limit) {
        return Err("世界状态响应超限".into());
    }
    let mut body = String::new();
    response
        .take(limit + 1)
        .read_to_string(&mut body)
        .map_err(|_| "世界状态响应读取失败")?;
    if body.len() as u64 > limit {
        return Err("世界状态响应超限".into());
    }
    Ok(body)
}
fn allowed(value: &str, values: &[&str]) -> bool {
    values.contains(&value)
}
pub fn validate_settings(s: &Settings) -> Result<(), String> {
    crate::world_notify::validate_delivery(&s.delivery)?;
    if s.reward_preferences.weapon_parts.len()>256||s.reward_preferences.weapon_parts.iter().any(|id|!id.starts_with("/Lotus/Types/Recipes/Weapons/")||id.len()>512){return Err("奖励订阅无效".into());}
    if s.timer_lead_minutes > 60 {
        return Err("世界周期提前提醒必须为 0 到 60 分钟".into());
    }
    if s.fissure_rules.len() > 32
        || s.alert_rewards.len() > 100
        || s.arbitration_nodes.len() > 100
        || s.cycle_states.len() > 8
        || s.arbitration_tiers.len() > 6
    {
        return Err("订阅条件过多".into());
    }
    let nodes = nodes();
    if let Some(p)=&s.arbitration_preferences {arbitration::validate(p,&nodes)?;}
    let planets: BTreeSet<_> = nodes
        .values()
        .filter_map(|n| n["planet"].as_str())
        .collect();
    let modes: BTreeSet<_> = nodes
        .values()
        .filter_map(|n| n["missionType"].as_str())
        .collect();
    let mut ids = BTreeSet::new();
    for r in &s.fissure_rules {
        if r.id.is_empty()
            || r.id.len() > 64
            || !ids.insert(&r.id)
            || !allowed(
                &r.r#type.to_lowercase(),
                &["all", "lith", "meso", "neo", "axi", "requiem", "omnia"],
            )
            || !allowed(&r.steel_path, &["all", "steelPath", "normal"])
            || (r.location != "all" && !planets.contains(r.location.as_str()))
            || (r.mode != "all" && !modes.contains(r.mode.as_str()))
        {
            return Err("裂缝订阅条件无效".into());
        }
    }
    if s.alert_rewards
        .iter()
        .any(|s| s.is_empty() || s.len() > 512 || s.chars().any(char::is_control))
        || s.arbitration_tiers
            .iter()
            .any(|s| !allowed(s, &["S", "A", "B", "C", "D", "F"]))
        || s.arbitration_nodes.iter().any(|s| !nodes.contains_key(s))
        || s.cycle_states.iter().any(|s| {
            !allowed(
                s,
                &[
                    "earth:day",
                    "earth:night",
                    "cetus:day",
                    "cetus:night",
                    "vallis:warm",
                    "vallis:cold",
                    "cambion:fass",
                    "cambion:vome",
                ],
            )
        })
    {
        return Err("世界提醒条件无效".into());
    }
    Ok(())
}
fn nodes() -> BTreeMap<String, Value> {
    let value: Value =
        serde_json::from_str(include_str!("../../public/world-nodes.json")).unwrap_or(Value::Null);
    serde_json::from_value(value.get("nodes").cloned().unwrap_or(value)).unwrap_or_default()
}
fn date(value: &Value) -> Option<i64> {
    if let Some(s) = value.as_str() {
        return DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp());
    }
    let date = value.get("$date").unwrap_or(value);
    if let Some(n) = date.as_i64() {
        return Some(n / 1000);
    }
    if let Some(s) = date["$numberLong"].as_str() {
        return s.parse::<i64>().ok().map(|n| n / 1000);
    }
    if let Some(n) = date.as_str().and_then(|s| s.parse::<i64>().ok()) {
        return Some(n / 1000);
    }
    None
}
fn iso(timestamp: i64) -> String {
    DateTime::from_timestamp(timestamp, 0)
        .map(|d| d.to_rfc3339())
        .unwrap_or_default()
}
fn mission(code: &str) -> String {
    match code {
        "MT_EXTERMINATION" => "Extermination",
        "MT_SURVIVAL" => "Survival",
        "MT_DEFENSE" => "Defense",
        "MT_MOBILE_DEFENSE" => "Mobile Defense",
        "MT_CAPTURE" => "Capture",
        "MT_RESCUE" => "Rescue",
        "MT_SABOTAGE" => "Sabotage",
        "MT_EXCAVATE" => "Excavation",
        "MT_TERRITORY" => "Interception",
        "MT_ASSASSINATION" => "Assassination",
        "MT_RETRIEVAL" => "Hijack",
        "MT_HIVE" => "Hive",
        "MT_INTEL" => "Spy",
        "MT_DISRUPTION" | "MT_ARTIFACT" => "Disruption",
        "MT_PURIFY" => "Infested Salvage",
        "MT_EVACUATION" => "Defection",
        "MT_ALCHEMY" => "Alchemy",
        "MT_CORRUPTION" => "Void Flood",
        "MT_ARMAGEDDON" => "Void Armageddon",
        "MT_ARENA" => "Arena",
        "MT_ASSAULT" => "Assault",
        "MT_CROSSFIRE" => "Crossfire",
        "MT_VOID_CASCADE" => "Void Cascade",
        "MT_VOID_ARMAGEDDON" => "Void Armageddon",
        "MT_VOID_FLOOD" => "Void Flood",
        _ => code,
    }
    .into()
}
fn faction(code: &str) -> String {
    if code == "FC_INFESTATION" {
        return "Infested".into();
    }
    if code == "FC_MITW" {
        return "The Murmur".into();
    }
    code.strip_prefix("FC_")
        .map(|s| {
            let mut c = s.chars();
            c.next()
                .map(|f| f.to_uppercase().collect::<String>() + &c.as_str().to_lowercase())
                .unwrap_or_default()
        })
        .unwrap_or_else(|| code.into())
}
fn reward_name(uid: &str) -> String {
    static NAMES: std::sync::OnceLock<BTreeMap<String, String>> = std::sync::OnceLock::new();
    let names = NAMES.get_or_init(|| {
        let extra: Value = serde_json::from_str(include_str!("../../public/world-rewards.json"))
            .unwrap_or(Value::Null);
        let mut names: BTreeMap<String, String> = extra
            .as_object()
            .into_iter()
            .flatten()
            .filter_map(|(id, item)| {
                Some((
                    id.clone(),
                    item["zh"].as_str().filter(|name|!name.contains('\u{fffd}')).or_else(|| item["en"].as_str())?.into(),
                ))
            })
            .collect();
        let raw: Value =
            serde_json::from_str(include_str!("../../public/catalog.json")).unwrap_or(Value::Null);
        for item in raw["items"].as_array().into_iter().flatten() {
            if let (Some(id), Some(name)) = (
                item["id"].as_str(),
                item["zh"]
                    .as_str()
                    .filter(|s| !s.is_empty())
                    .or_else(|| item["name"].as_str()),
            ) {
                names.entry(id.into()).or_insert_with(|| name.into());
            }
        }
        // The catalog contains generic component labels. Preserve the exact
        // recipe relation so reward notices identify which weapon owns a part.
        let mut parents:BTreeMap<String,BTreeSet<String>>=BTreeMap::new();
        for item in raw["items"].as_array().into_iter().flatten(){let Some(parent)=item["id"].as_str().and_then(|id|names.get(id)).cloned()else{continue;};for part in item["recipe"]["parts"].as_array().into_iter().flatten(){if let Some(id)=part["itemId"].as_str(){parents.entry(id.into()).or_default().insert(parent.clone());}}}
        for(id,parents)in parents{if let Some(name)=names.get_mut(&id){if ["Blueprint","Barrel","Receiver","Stock","Blade","Handle","Hilt","Link","Chassis","Neuroptics","Systems","蓝图","枪管","枪机","枪托","刀刃","握柄","连接器","机体","头部神经光元","系统"].contains(&name.as_str()){*name=format!("{} {}",parents.into_iter().take(3).collect::<Vec<_>>().join(" / "),name);}}}
        for(tail,label)in [("OrokinCatalyst","奥罗金催化剂"),("OrokinReactor","奥罗金反应堆"),("UtilityUnlocker","特殊功能槽连接器"),("WeaponUtilityUnlocker","武器特殊功能槽连接器")]{for prefix in ["/Lotus/Types/Items/MiscItems/","/Lotus/Types/Recipes/Components/"]{names.insert(format!("{prefix}{tail}"),label.into());names.insert(format!("{prefix}{tail}Blueprint"),format!("{label}蓝图"));}}
        names
    });
    names
        .get(uid)
        .cloned()
        .unwrap_or_else(|| uid.rsplit('/').next().unwrap_or(uid).into())
}
fn event(raw: &Value, kind: &str, nodes: &BTreeMap<String, Value>, now: i64) -> Option<Event> {
    let activation = date(&raw["Activation"])?;
    let expiry = date(&raw["Expiry"])?;
    if expiry <= now {
        return None;
    }
    let id = raw["_id"]["$oid"]
        .as_str()
        .or_else(|| raw["_id"]["oid"].as_str())
        .or_else(|| raw["_id"].as_str())?
        .to_owned();
    let info = raw.get("MissionInfo").unwrap_or(raw);
    let node = info["location"]
        .as_str()
        .or_else(|| info["Node"].as_str())
        .or_else(|| raw["Node"].as_str())?
        .to_owned();
    let meta = nodes.get(&node);
    let get = |key: &str| meta.and_then(|m| m[key].as_str()).unwrap_or("").to_owned();
    let tier = raw["Modifier"]
        .as_str()
        .or_else(|| raw["ActiveMissionTier"].as_str())
        .and_then(|s| match s {
            "VoidT1" => Some("Lith"),
            "VoidT2" => Some("Meso"),
            "VoidT3" => Some("Neo"),
            "VoidT4" => Some("Axi"),
            "VoidT5" => Some("Requiem"),
            "VoidT6" => Some("Omnia"),
            _ => None,
        })
        .map(str::to_owned);
    let mut rewards = vec![];
    let reward = &info["missionReward"];
    for field in ["items", "Items"] {
        if let Some(items) = reward[field].as_array() {
            for item in items {
                if let Some(s) = item.as_str() {
                    rewards.push(reward_name(s));
                }
            }
        }
    }
    for field in ["countedItems", "CountedItems"] {
        if let Some(items) = reward[field].as_array() {
            for item in items {
                if let Some(s) = item["ItemType"].as_str() {
                    let quantity = item["ItemCount"].as_u64().unwrap_or(1);
                    rewards.push(format!("{} ×{}", reward_name(s), quantity));
                }
            }
        }
    }
    if let Some(n) = reward["credits"].as_u64() {
        if n > 0 {
            rewards.push(format!("现金 {n}"));
        }
    }
    Some(Event {
        id: format!("{kind}:{id}"),
        kind: kind.into(),
        node_id: node.clone(),
        node: if get("zh").is_empty() {
            if get("name").is_empty() {
                node
            } else {
                get("name")
            }
        } else {
            get("zh")
        },
        planet: get("planet"),
        mission_type: info["missionType"]
            .as_str()
            .or_else(|| info["MissionType"].as_str())
            .map(mission)
            .unwrap_or_else(|| get("missionType")),
        faction: info["faction"]
            .as_str()
            .or_else(|| info["Enemy"].as_str())
            .map(faction)
            .unwrap_or_else(|| get("faction")),
        tier,
        steel_path: raw["Hard"].as_bool().unwrap_or(false),
        void_storm: false,
        activation: iso(activation),
        expiry: iso(expiry),
        rewards,
        rating: None,
        predicted: false,
    })
}
pub fn parse_official(
    raw: &Value,
    now: i64,
) -> Result<(Vec<Event>, Vec<Event>, Vec<Cycle>), String> {
    if !raw.is_object() || !raw["ActiveMissions"].is_array() || !raw["Alerts"].is_array() {
        return Err("官方世界状态缺少任务列表".into());
    }
    let nodes = nodes();
    let mut fissures = vec![];
    for field in ["ActiveMissions", "VoidStorms"] {
        if let Some(items) = raw[field].as_array() {
            fissures.extend(
                items
                    .iter()
                    .filter_map(|r| event(r, "fissure", &nodes, now))
                    .map(|mut e| { e.void_storm = field == "VoidStorms"; e }),
            );
        }
    }
    let mut ids = BTreeSet::new();
    fissures.retain(|e| ids.insert(e.id.clone()));
    let alerts = raw["Alerts"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|r| event(r, "alert", &nodes, now))
        .collect();
    Ok((fissures, alerts, cycles(raw, now)))
}
fn phase(now: i64, anchor: i64, states: &[(&str, i64)], id: &str, name: &str) -> Cycle {
    let period: i64 = states.iter().map(|(_, n)| *n).sum();
    let mut position = (now - anchor).rem_euclid(period);
    for (index, (state, duration)) in states.iter().enumerate() {
        if position < *duration {
            return Cycle {
                id: id.into(),
                name: name.into(),
                state: (*state).into(),
                next_state: states[(index + 1) % states.len()].0.into(),
                expiry: iso(now + duration - position),
            };
        }
        position -= duration;
    }
    unreachable!()
}
fn cycles(raw: &Value, now: i64) -> Vec<Cycle> {
    let mut result = vec![phase(
        now,
        0,
        &[("day", 14400), ("night", 14400)],
        "earth",
        "地球",
    )];
    if let Some(anchor) = raw["SyndicateMissions"]
        .as_array()
        .and_then(|ms| {
            ms.iter()
                .find(|m| m["Tag"].as_str() == Some("CetusSyndicate"))
        })
        .and_then(|m| date(&m["Activation"]))
    {
        result.push(phase(
            now,
            anchor,
            &[("day", 6000), ("night", 3000)],
            "cetus",
            "希图斯",
        ));
        result.push(phase(
            now,
            anchor,
            &[("fass", 6000), ("vome", 3000)],
            "cambion",
            "魔胎之境",
        ));
    }
    let vallis_anchor = DateTime::parse_from_rfc3339("2018-11-10T08:13:48Z")
        .unwrap()
        .timestamp();
    result.push(phase(
        now,
        vallis_anchor,
        &[("warm", 400), ("cold", 1200)],
        "vallis",
        "奥布山谷",
    ));
    result
}
pub fn parse_schedule(text: &str, now: i64) -> Result<Vec<Event>, String> {
    let nodes = nodes();
    let raw: Value = serde_json::from_str(include_str!("../../public/arbitration-tiers.json"))
        .unwrap_or(Value::Null);
    let tiers = raw.get("tiers").unwrap_or(&raw);
    let mut events = vec![];
    let mut seen=BTreeSet::new();
    let mut valid = 0;
    for line in text.lines() {
        let Some((time, node)) = line.trim().split_once(',') else {
            continue;
        };
        let Ok(time) = time.parse::<i64>() else {
            continue;
        };
        let node = node.trim();
        if node.is_empty() || node.len() > 128 {
            continue;
        }
        valid += 1;
        if !(946684800..=4102444800).contains(&time) {
            continue;
        }
        if time + 3600 <= now || time > now + 7 * 86400 {
            continue;
        }
        if !seen.insert((time,node.to_owned())) {continue;}
        let meta = nodes.get(node);
        let get = |key: &str| meta.and_then(|v| v[key].as_str()).unwrap_or("").to_owned();
        events.push(Event {
            id: format!("arbitration:{time}:{node}"),
            kind: "arbitration".into(),
            node_id: node.into(),
            node: if get("zh").is_empty() {
                get("name")
            } else {
                get("zh")
            },
            planet: get("planet"),
            mission_type: get("missionType"),
            faction: get("faction"),
            tier: None,
            steel_path: false,
            void_storm: false,
            activation: iso(time),
            expiry: iso(time + 3600),
            rewards: vec![],
            rating: tiers[node].as_str().map(str::to_owned),
            predicted: true,
        });
    }
    if valid == 0 {
        return Err("仲裁排期无有效记录".into());
    }
    events.sort_by(|a, b| a.activation.cmp(&b.activation));
    Ok(events)
}
fn conversation_notice(id:&str,scope:&str,player:&str,settings:&crate::world_notify::DeliverySettings)->Result<Option<Notice>,String>{
 if id.is_empty()||id.len()>100||!id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-')||player.is_empty()||player.len()>64||!player.bytes().all(|b|b.is_ascii_alphanumeric()||b"._-".contains(&b)){return Err("游戏会话事件字段无效".into());}
 if !settings.conversation_enabled||settings.conversation_template.is_empty(){return Ok(None);}
 Ok(Some(Notice{id:format!("conversation:{scope}:{id}"),title:"新的游戏会话".into(),body:settings.conversation_template.replace("<PLAYER_NAME>",player),kind:"conversation".into(),created_at:String::new(),delivery_error:None,system_state:None}))
}
fn matches_rule(e: &Event, r: &Rule) -> bool {
    (r.r#type == "all"
        || e.tier
            .as_ref()
            .is_some_and(|t| t.eq_ignore_ascii_case(&r.r#type)))
        && (r.mode == "all" || r.mode == e.mission_type)
        && (r.location == "all" || r.location == e.planet)
        && (r.steel_path == "all" || (r.steel_path == "steelPath") == e.steel_path)
}
/// Recheck the current subscription when a game notice is displayed, including after edits.
pub fn overlay_notice_allowed(kind:&str,id:&str,status:&Status)->bool {
    match kind {
        "fissure"=>status.fissures.iter().any(|e|e.id==id && subscribed(e,&status.subscriptions)),
        "alert"=>status.alerts.iter().any(|e|e.id==id && subscribed(e,&status.subscriptions)),
        "arbitration"=>status.subscriptions.arbitration_enabled && status.arbitrations.iter().any(|e|id.contains(&e.id) && subscribed(e,&status.subscriptions)),
        "cycle"=>id.strip_prefix("cycle:").and_then(|s|{let mut parts=s.split(':');Some(format!("{}:{}",parts.next()?,parts.next()?))}).is_some_and(|key|status.subscriptions.cycle_states.contains(&key)),
        "reward"=>status.reward_missions.iter().any(|mission|mission.rewards.iter().any(|reward|id==format!("reward:{}:{}",mission.id,reward.id) && rewards::selected(reward,&status.subscriptions.reward_preferences))),
        "conversation"=>status.subscriptions.delivery.conversation_enabled && !status.subscriptions.delivery.conversation_template.is_empty(),
        "riven-monitor"=>id.starts_with("riven-monitor:"),
        _=>false,
    }
}
fn subscribed(e: &Event, s: &Settings) -> bool {
    match e.kind.as_str() {
        "fissure" => s.fissure_enabled && (s.fissure_all || s.fissure_rules.iter().any(|r| (r.r#type!="all" || r.mode!="all" || r.location!="all" || r.steel_path!="all") && matches_rule(e, r))),
        "alert" => {
            s.alert_enabled
                && (s.alert_rewards.is_empty()
                    || e.rewards.iter().any(|r| {
                        s.alert_rewards
                            .iter()
                            .any(|keyword| r.to_lowercase().contains(&keyword.to_lowercase()))
                    }))
        }
        "arbitration" => {
            if let Some(p)=&s.arbitration_preferences {return s.arbitration_enabled&&arbitration::matches(e,p);}
            s.arbitration_enabled
                && (e
                    .rating
                    .as_ref()
                    .is_some_and(|rating| s.arbitration_tiers.contains(rating))
                    || s.arbitration_nodes.contains(&e.node_id))
        }
        _ => false,
    }
}
fn observe(
    c: &mut Connection,
    status: &Status,
    now: i64,
    initialized: &mut BTreeSet<String>,
) -> Result<Vec<Notice>, String> {
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let mut notices = vec![];
    for (kind, events) in [
        ("fissure", &status.fissures),
        ("alert", &status.alerts),
        ("arbitration", &status.arbitrations),
    ] {
        if status.stale && kind != "arbitration" {
            continue;
        }
        if kind == "arbitration" && events.is_empty() {
            continue;
        }
        let ready = initialized.contains(kind);
        if kind=="arbitration" {
            if let Some(p)=&status.subscriptions.arbitration_preferences {
                let fresh=status.sources.iter().find(|s|s.id=="arbitration-schedule").and_then(|s|s.fetched_at.as_deref()).and_then(|t|DateTime::parse_from_rfc3339(t).ok()).is_some_and(|t|(0..86400).contains(&(now-t.timestamp())));
                if !fresh {continue;}
                for notice in arbitration::due(events,p,status.subscriptions.arbitration_enabled,now) {
                    let known=tx.query_row("SELECT 1 FROM world_seen WHERE id=?",[&notice.id],|r|r.get::<_,i32>(0)).is_ok();
                    if !known {notices.push(notice.clone());}
                    tx.execute("INSERT OR REPLACE INTO world_seen VALUES(?,?)",params![notice.id,now]).map_err(|e|e.to_string())?;
                }
                initialized.insert(kind.into());
                continue;
            }
        }
        for e in events {
            let active = DateTime::parse_from_rfc3339(&e.activation)
                .is_ok_and(|d| d.timestamp() <= now)
                && DateTime::parse_from_rfc3339(&e.expiry).is_ok_and(|d| d.timestamp() > now);
            if !active {
                continue;
            }
            let known = tx
                .query_row("SELECT 1 FROM world_seen WHERE id=?", [&e.id], |r| {
                    r.get::<_, i32>(0)
                })
                .is_ok();
            let rare_handles=kind=="alert"&&status.reward_missions.iter().any(|row|row.id.starts_with(&(e.id.clone()+":"))&&row.rewards.iter().any(|reward|rewards::selected(reward,&status.subscriptions.reward_preferences)));
            if ready && !known && !rare_handles && subscribed(e, &status.subscriptions) {
                notices.push(Notice {
                    id: e.id.clone(),
                    title: match kind {
                        "fissure" => "虚空裂缝提醒",
                        "alert" => "警报提醒",
                        _ => "仲裁预测提醒",
                    }
                    .into(),
                    body: format!(
                        "{} · {} · {}{}",
                        e.node,
                        e.mission_type,
                        e.tier.as_deref().or(e.rating.as_deref()).unwrap_or(""),
                        if e.predicted {
                            "（社区预测）"
                        } else {
                            ""
                        }
                    ),
                    created_at: iso(now),
                    kind: kind.into(),
                    delivery_error: None,
                    system_state: None,
                });
            }
            tx.execute(
                "INSERT OR REPLACE INTO world_seen VALUES(?,?)",
                params![e.id, now],
            )
            .map_err(|e| e.to_string())?;
        }
        initialized.insert(kind.into());
    }
    if !status.stale {
        let ready=initialized.contains("reward");
        for row in &status.reward_missions{
            if row.expiry.as_ref().is_some_and(|end|DateTime::parse_from_rfc3339(end).is_ok_and(|end|end.timestamp()<=now)){continue;}
            for reward in &row.rewards{
                let id=format!("reward:{}:{}",row.id,reward.id);
                let known=tx.query_row("SELECT 1 FROM world_seen WHERE id=?",[&id],|r|r.get::<_,i32>(0)).is_ok();
                if ready&&!known&&rewards::selected(reward,&status.subscriptions.reward_preferences){notices.push(Notice{id:id.clone(),title:"稀有奖励提醒".into(),body:format!("{} · {} · {} ×{}",row.node,row.faction,reward.name,reward.quantity),created_at:iso(now),kind:"reward".into(),delivery_error:None,system_state:None});}
                tx.execute("INSERT OR REPLACE INTO world_seen VALUES(?,?)",params![id,now]).map_err(|e|e.to_string())?;
            }
        }
        initialized.insert("reward".into());
    }
    if !status.stale {
        let ready = initialized.contains("cycle");
        for cycle in &status.cycles {
            if let Ok(expiry) = DateTime::parse_from_rfc3339(&cycle.expiry) {
                let remaining = expiry.timestamp() - now;
                let lead = i64::from(status.subscriptions.timer_lead_minutes) * 60;
                // A zero lead targets the beginning of the current phase. The refresh loop
                // polls every 30 seconds; allow one minute for its bounded network work.
                let duration = match (cycle.id.as_str(), cycle.state.as_str()) {
                    ("earth", "day" | "night") => 14400,
                    ("cetus", "day") | ("cambion", "fass") => 6000,
                    ("cetus", "night") | ("cambion", "vome") => 3000,
                    ("vallis", "warm") => 400,
                    ("vallis", "cold") => 1200,
                    _ => 0,
                };
                let started_at = expiry.timestamp() - duration;
                let at_change = lead == 0 && duration > 0 && (0..=60).contains(&(now - started_at));
                if at_change || lead > 0 && remaining > 0 && remaining <= lead {
                    let target_state = if at_change { &cycle.state } else { &cycle.next_state };
                    let transition = if at_change { iso(started_at) } else { cycle.expiry.clone() };
                    let id = format!("cycle:{}:{}:{}", cycle.id, target_state, transition);
                    let known = tx
                        .query_row("SELECT 1 FROM world_seen WHERE id=?", [&id], |r| {
                            r.get::<_, i32>(0)
                        })
                        .is_ok();
                    if ready
                        && !known
                        && status
                            .subscriptions
                            .cycle_states
                            .contains(&format!("{}:{}", cycle.id, target_state))
                    {
                        notices.push(Notice {
                            id: id.clone(),
                            title: format!("{}周期提醒", cycle.name),
                            body: if at_change { format!("{} 已进入 {}", cycle.name, target_state) } else { format!("{} 即将进入 {}", cycle.name, target_state) },
                            created_at: iso(now),
                            kind: "cycle".into(),
                            delivery_error: None,
                            system_state: None,
                        });
                    }
                    tx.execute(
                        "INSERT OR REPLACE INTO world_seen VALUES(?,?)",
                        params![id, now],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        initialized.insert("cycle".into());
    }
    for notice in &notices {
        tx.execute(
            "INSERT OR IGNORE INTO world_notices VALUES(?,?)",
            params![
                notice.id,
                serde_json::to_string(notice).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.execute("DELETE FROM world_notices WHERE rowid NOT IN (SELECT rowid FROM world_notices ORDER BY rowid DESC LIMIT 100)",[]).map_err(|e|e.to_string())?;
    tx.execute(
        "DELETE FROM world_seen WHERE last_seen<?",
        [now - 7 * 86400],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(notices)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    const NOW: i64 = 1792742956;
    fn database() -> Connection {
        db(&PathBuf::from(":memory:")).unwrap()
    }
    fn rule() -> Rule {
        Rule {
            id: "r".into(),
            r#type: "all".into(),
            mode: "all".into(),
            location: "all".into(),
            steel_path: "all".into(),
        }
    }
    fn event(id: &str) -> Event {
        Event {
            id: id.into(),
            kind: "fissure".into(),
            node_id: "SolNode25".into(),
            node: "Callisto".into(),
            planet: "Jupiter".into(),
            mission_type: "Interception".into(),
            faction: "Corpus".into(),
            tier: Some("Meso".into()),
            steel_path: true,
            void_storm: false,
            activation: iso(NOW - 30),
            expiry: iso(NOW + 1000),
            rewards: vec![],
            rating: None,
            predicted: false,
        }
    }
    fn status() -> Status {
        let mut s = Status::default();
        s.stale = false;
        s.fissures.push(event("first"));
        s.subscriptions.fissure_enabled = true;
        s.subscriptions.fissure_all = true;
        s.subscriptions.fissure_rules.push(rule());
        s
    }
    #[test]
    fn game_notices_require_a_current_matching_subscription() {
        let mut s=Status::default();s.fissures.push(event("new"));
        assert!(!overlay_notice_allowed("fissure","new",&s));
        s.subscriptions.fissure_enabled=true;
        assert!(!overlay_notice_allowed("fissure","new",&s));
        s.subscriptions.fissure_rules.push(rule());
        assert!(!overlay_notice_allowed("fissure","new",&s)); // legacy implicit wildcard is not consent to all notifications
        s.subscriptions.fissure_rules[0].r#type="meso".into();
        assert!(overlay_notice_allowed("fissure","new",&s));
        s.subscriptions.fissure_rules[0].r#type="all".into();
        s.subscriptions.fissure_all=true;
        assert!(overlay_notice_allowed("fissure","new",&s));
        assert!(!overlay_notice_allowed("fissure","unsubscribed-id",&s));
        s.subscriptions.fissure_enabled=false;
        assert!(!overlay_notice_allowed("fissure","new",&s));
        assert!(!overlay_notice_allowed("unknown","new",&s));
    }
    #[test]
    fn real_public_schema_keeps_alerts_and_storm_tiers() {
        let raw: Value = serde_json::from_str(include_str!(
            "../../tests/fixtures/world-api.json"
        ))
        .unwrap();
        let (fissures, alerts, cycles) =
            parse_official(&raw, raw["Time"].as_i64().unwrap()).unwrap();
        assert!(!fissures.is_empty());
        assert!(!alerts.is_empty());
        assert_eq!(cycles.len(), 4);
        assert!(alerts.iter().all(|e| !e.mission_type.starts_with("MT_")
            && !e.rewards.iter().any(|r| r.starts_with("/Lotus/"))));
        assert!(fissures.iter().all(|e| e.tier.is_some()));
        assert_eq!(fissures.iter().filter(|e| e.void_storm).count(), raw["VoidStorms"].as_array().unwrap().len());
        assert!(fissures.iter().filter(|e| e.void_storm).all(|e| !e.steel_path));
        assert!(fissures
            .iter()
            .any(|e| e.node_id.starts_with("CrewBattleNode")));
    }
    #[test]
    fn first_load_is_silent_then_only_new_ids_push() {
        let mut c = database();
        let mut initialized = BTreeSet::new();
        let mut s = status();
        assert!(observe(&mut c, &s, NOW, &mut initialized)
            .unwrap()
            .is_empty());
        s.fissures.push(event("new"));
        assert_eq!(
            observe(&mut c, &s, NOW + 1, &mut initialized)
                .unwrap()
                .len(),
            1
        );
        assert!(observe(&mut c, &s, NOW + 2, &mut initialized)
            .unwrap()
            .is_empty());
    }
    #[test]
    fn enabling_or_changing_rules_does_not_backfill_existing_fissures() {
        let mut c = database();
        let mut initialized = BTreeSet::new();
        let mut s = status();
        s.subscriptions.fissure_enabled = false;
        observe(&mut c, &s, NOW, &mut initialized).unwrap();
        s.subscriptions.fissure_enabled = true;
        s.subscriptions.fissure_rules.push(rule());
        assert!(observe(&mut c, &s, NOW + 1, &mut initialized)
            .unwrap()
            .is_empty());
        s.fissures.push(event("new"));
        assert_eq!(
            observe(&mut c, &s, NOW + 2, &mut initialized)
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn restart_and_expired_events_do_not_repeat() {
        let mut c = database();
        let mut initialized = BTreeSet::new();
        let mut s = status();
        observe(&mut c, &s, NOW, &mut initialized).unwrap();
        s.fissures.push(event("new"));
        observe(&mut c, &s, NOW + 1, &mut initialized).unwrap();
        initialized.clear();
        assert!(observe(&mut c, &s, NOW + 2, &mut initialized)
            .unwrap()
            .is_empty());
        let mut expired = event("expired");
        expired.expiry = iso(NOW);
        s.fissures.push(expired);
        assert!(observe(&mut c, &s, NOW + 3, &mut initialized)
            .unwrap()
            .is_empty());
    }
    #[test]
    fn failure_keeps_last_lists_and_has_separate_provider_baselines() {
        let mut c = database();
        let mut initialized = BTreeSet::new();
        let mut s = status();
        let old = s.fissures.len();
        apply_official(&mut s, Err("offline".into()), NOW);
        assert_eq!(s.fissures.len(), old);
        assert!(s.stale);
        observe(&mut c, &s, NOW, &mut initialized).unwrap();
        assert!(!initialized.contains("fissure"));
        s.stale = false;
        assert!(observe(&mut c, &s, NOW + 1, &mut initialized)
            .unwrap()
            .is_empty());
    }
    #[test]
    fn four_rule_fields_and_keyword_reward_matching() {
        let e = event("x");
        let mut r = rule();
        r.r#type = "meso".into();
        r.mode = "Interception".into();
        r.location = "Jupiter".into();
        r.steel_path = "steelPath".into();
        assert!(matches_rule(&e, &r));
        r.steel_path = "normal".into();
        assert!(!matches_rule(&e, &r));
        let mut s = Settings::default();
        s.alert_enabled = true;
        s.alert_rewards = vec!["orokin".into()];
        let mut a = e;
        a.kind = "alert".into();
        a.rewards = vec!["Orokin Catalyst Blueprint ×1".into()];
        assert!(subscribed(&a, &s));
    }
    #[test]
    fn arbitration_ratings_or_favorite_nodes_only_push_when_active() {
        let mut e = event("arby");
        e.kind = "arbitration".into();
        e.rating = None;
        e.predicted = true;
        let mut s = status();
        s.fissures.clear();
        s.arbitrations = vec![e.clone()];
        s.subscriptions.arbitration_enabled = true;
        assert!(!subscribed(&e, &s.subscriptions));
        s.subscriptions.arbitration_nodes.push(e.node_id.clone());
        assert!(subscribed(&e, &s.subscriptions));
        let mut c = database();
        let mut initialized = BTreeSet::new();
        s.arbitrations[0].activation = iso(NOW + 100);
        observe(&mut c, &s, NOW, &mut initialized).unwrap();
        assert!(observe(&mut c, &s, NOW + 90, &mut initialized)
            .unwrap()
            .is_empty());
        assert_eq!(
            observe(&mut c, &s, NOW + 100, &mut initialized)
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn schedule_never_loops_expired_or_invalid_data() {
        assert!(parse_schedule("1727884800,SolNode25", NOW)
            .unwrap()
            .is_empty());
        assert!(parse_schedule("not-a-schedule", NOW).is_err());
        let rows = parse_schedule(
            &format!("{},SolNode25\n{},SolNode999999", NOW, NOW + 3600),
            NOW,
        )
        .unwrap();
        assert_eq!(rows[0].rating.as_deref(), Some("S"));
        assert!(rows[1].rating.is_none());
        assert!(rows.iter().all(|e| e.predicted));
    }
    #[test]
    fn cycles_match_original_anchors_and_boundaries() {
        let raw = json!({"SyndicateMissions":[{"Tag":"CetusSyndicate","Activation":{"$date":{"$numberLong":(NOW*1000).to_string()}}}]});
        let c = cycles(&raw, NOW);
        let cetus = c.iter().find(|c| c.id == "cetus").unwrap();
        let cambion = c.iter().find(|c| c.id == "cambion").unwrap();
        assert_eq!(cetus.state, "day");
        assert_eq!(cetus.expiry, cambion.expiry);
        assert_eq!(
            phase(
                14400,
                0,
                &[("day", 14400), ("night", 14400)],
                "earth",
                "Earth"
            )
            .state,
            "night"
        );
        assert_eq!(
            phase(
                NOW + 6000,
                NOW,
                &[("day", 6000), ("night", 3000)],
                "cetus",
                "Cetus"
            )
            .state,
            "night"
        );
    }
    #[test]
    fn invalid_subscription_values_are_rejected() {
        let mut s = Settings::default();
        let mut r = rule();
        r.r#type = "meso".into();
        s.fissure_rules.push(r);
        assert!(validate_settings(&s).is_ok());
        s.fissure_rules[0].location = "https://example.test".into();
        assert!(validate_settings(&s).is_err());
    }
    #[test]
    fn notification_test_persists_errors_without_altering_subscriptions_or_seen() {
        let path = std::env::temp_dir().join(format!(
            "myframe-notice-test-{}-{}.sqlite3",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap()
        ));
        {
            let service = WorldService::new(path.clone()).unwrap();
            let notice = service
                .test_notification_with(|_| Err("native rejected".into()))
                .unwrap();
            assert_eq!(notice.delivery_error.as_deref(), Some("native rejected"));
            assert_eq!(service.status().notifications[0].id, notice.id);
            assert!(!service.status().subscriptions.alert_enabled);
            assert!(service
                .test_notification_with(|_| panic!("duplicate test should be throttled"))
                .is_err());
            assert!(service
                .notification_failure("unknown-notice", "error".into())
                .is_err());
            let updated = service
                .notification_failure(&notice.id, "async rejected".into())
                .unwrap();
            assert_eq!(updated.delivery_error.as_deref(), Some("async rejected"));
            let c = db(&path).unwrap();
            assert_eq!(
                c.query_row("SELECT count(*) FROM world_seen", [], |r| r
                    .get::<_, i64>(0))
                    .unwrap(),
                0
            );
        }
        let restored = WorldService::new(path.clone()).unwrap().status();
        assert_eq!(restored.notifications.len(), 1);
        assert_eq!(restored.notifications[0].kind, "test");
        assert_eq!(
            restored.notifications[0].delivery_error.as_deref(),
            Some("async rejected")
        );
        let _ = std::fs::remove_file(path);
    }
    #[test]
    fn settings_survive_a_fresh_service() {
        let path = std::env::temp_dir().join(format!(
            "myframe-world-settings-{}-{}.sqlite3",
            std::process::id(),
            Utc::now().timestamp_nanos_opt().unwrap()
        ));
        {
            let service = WorldService::new(path.clone()).unwrap();
            let mut settings = Settings::default();
            settings.alert_enabled = true;
            settings.timer_lead_minutes = 17;
            let mut arbitration=arbitration::Preferences::default();
            arbitration.favorite_node_ids=vec!["SolNode25".into()];
            arbitration.reminder_ids=vec![format!("arbitration:{}:SolNode25",NOW+3600)];
            settings.arbitration_preferences=Some(arbitration);
            service.set_subscriptions(settings).unwrap();
        }
        assert!(
            WorldService::new(path.clone())
                .unwrap()
                .status()
                .subscriptions
                .alert_enabled
        );
        assert_eq!(WorldService::new(path.clone()).unwrap().status().subscriptions.timer_lead_minutes,17);
        let saved=WorldService::new(path.clone()).unwrap().status().subscriptions.arbitration_preferences.unwrap();
        assert_eq!(saved.favorite_node_ids,vec!["SolNode25"]);
        assert_eq!(saved.reminder_ids,vec![format!("arbitration:{}:SolNode25",NOW+3600)]);
        let _ = std::fs::remove_file(path);
    }
    #[test]
    fn arbitration_seven_days_do_not_repeat_expired_or_out_of_range_rows() {
        let raw=(0..=170).map(|n|format!("{},SolNode25",NOW+n*3600)).collect::<Vec<_>>().join("\n");
        let rows=parse_schedule(&raw,NOW).unwrap();
        assert_eq!(rows.len(),169);
        assert_eq!(DateTime::parse_from_rfc3339(&rows.last().unwrap().activation).unwrap().timestamp(),NOW+7*86400);
        assert_eq!(parse_schedule(&format!("{raw}\n{raw}"),NOW).unwrap().len(),169);
    }
    #[test]
    fn arbitration_one_time_and_recurring_advance_start_deduplicate_across_restart() {
        let mut c=database();let mut initialized=BTreeSet::new();let mut s=status();
        s.fissures.clear();s.alerts.clear();s.cycles.clear();
        s.sources=Status::default().sources;s.sources[1].fetched_at=Some(iso(NOW-1000));
        let e=parse_schedule(&format!("{},SolNode25",NOW+600),NOW).unwrap().remove(0);
        let mut p=arbitration::Preferences::default();p.reminder_ids.push(e.id.clone());
        s.arbitrations=vec![e.clone()];s.subscriptions.arbitration_preferences=Some(p.clone());
        assert!(!s.subscriptions.arbitration_enabled);
        assert!(observe(&mut c,&s,NOW-1,&mut initialized).unwrap().is_empty());
        let first=observe(&mut c,&s,NOW,&mut initialized).unwrap();assert_eq!(first.len(),1);assert!(first[0].id.ends_with(":advance"));
        assert!(observe(&mut c,&s,NOW+1,&mut initialized).unwrap().is_empty());
        initialized.clear();assert!(observe(&mut c,&s,NOW+2,&mut initialized).unwrap().is_empty());
        let start=observe(&mut c,&s,NOW+600,&mut initialized).unwrap();assert_eq!(start.len(),1);assert!(start[0].id.ends_with(":start"));
        assert!(observe(&mut c,&s,NOW+601,&mut initialized).unwrap().is_empty());
        p.reminder_ids.clear();p.favorite_node_ids=vec![e.node_id.clone()];
        assert!(arbitration::due(&[e.clone()],&p,false,NOW).is_empty());
        p.alert_filter.favorites_only=true;p.alert_filter.mission_types=vec!["Survival".into()];
        assert!(arbitration::due(&[e.clone()],&p,true,NOW).is_empty());
        p.alert_filter.mission_types.clear();assert_eq!(arbitration::due(&[e.clone()],&p,true,NOW).len(),1);
        p.notify_on_start=false;assert!(arbitration::due(&[e],&p,true,NOW+600).is_empty());
        let e=parse_schedule(&format!("{},SolNode25",NOW+600),NOW).unwrap().remove(0);
        p.legacy_match=Some(arbitration::LegacyMatch{tiers:vec!["S".into()],node_ids:vec![]});assert!(arbitration::matches(&e,&p));
        p.legacy_match=Some(arbitration::LegacyMatch{tiers:vec![],node_ids:vec![e.node_id.clone()]});assert!(arbitration::matches(&e,&p));
        // A saved reminder may still be due when the app starts inside its lead window.
        let mut fresh=database();let mut boot=BTreeSet::new();
        let first_boot=observe(&mut fresh,&s,NOW,&mut boot).unwrap();assert_eq!(first_boot.len(),1);
    }
    #[test]
    fn arbitration_stale_sources_pause_new_alerts_and_invalid_preferences_fail() {
        let mut s=status();s.fissures.clear();s.alerts.clear();s.cycles.clear();s.sources=Status::default().sources;
        let e=parse_schedule(&format!("{},SolNode25",NOW+600),NOW).unwrap().remove(0);
        let mut p=arbitration::Preferences::default();p.reminder_ids.push(e.id.clone());s.arbitrations=vec![e];s.subscriptions.arbitration_preferences=Some(p.clone());
        let mut c=database();let mut initialized=BTreeSet::from(["arbitration".into()]);
        s.sources[1].fetched_at=Some(iso(NOW-86400));assert!(observe(&mut c,&s,NOW,&mut initialized).unwrap().is_empty());
        s.sources[1].fetched_at=Some(iso(NOW+1));assert!(observe(&mut c,&s,NOW,&mut initialized).unwrap().is_empty());
        assert!(validate_settings(&s.subscriptions).is_ok());
        p.lead_minutes=7;s.subscriptions.arbitration_preferences=Some(p.clone());assert!(validate_settings(&s.subscriptions).is_err());
        p.lead_minutes=10;p.reminder_ids=vec!["arbitration:1:missing".into()];s.subscriptions.arbitration_preferences=Some(p);assert!(validate_settings(&s.subscriptions).is_err());
    }
    #[test]
    fn cycle_lead_migrates_and_rejects_invalid_values() {
        let old: Settings = serde_json::from_value(json!({"cycleStates":["earth:night"]})).unwrap();
        assert_eq!(old.timer_lead_minutes,3);
        for value in [json!(-1),json!(1.5),json!("3"),json!(null)] {
            assert!(serde_json::from_value::<Settings>(json!({"timerLeadMinutes":value})).is_err());
        }
        for minutes in [0,3,60] {let mut settings=Settings::default();settings.timer_lead_minutes=minutes;assert!(validate_settings(&settings).is_ok());}
        let mut settings=Settings::default();settings.timer_lead_minutes=61;assert!(validate_settings(&settings).is_err());
    }
    #[test]
    fn cycle_lead_uses_selected_window_and_keeps_identity_across_edits_and_restart() {
        let mut c=database();let mut s=status();s.fissures.clear();s.alerts.clear();s.arbitrations.clear();
        s.subscriptions.cycle_states=vec!["earth:night".into()];
        s.cycles=vec![Cycle{id:"earth".into(),name:"Earth".into(),state:"day".into(),next_state:"night".into(),expiry:iso(NOW+600)}];
        let mut initialized=BTreeSet::new();
        assert!(observe(&mut c,&s,NOW,&mut initialized).unwrap().is_empty());
        // A ten-minute lead is due well before the former fixed 180-second window.
        s.subscriptions.timer_lead_minutes=10;
        let notices=observe(&mut c,&s,NOW,&mut initialized).unwrap();assert_eq!(notices.len(),1);assert_eq!(notices[0].kind,"cycle");
        assert!(observe(&mut c,&s,NOW+1,&mut initialized).unwrap().is_empty());
        s.subscriptions.timer_lead_minutes=60;assert!(observe(&mut c,&s,NOW+2,&mut initialized).unwrap().is_empty());
        let mut restarted=BTreeSet::new();
        assert!(observe(&mut c,&s,NOW+3,&mut restarted).unwrap().is_empty());
        assert!(observe(&mut c,&s,NOW+4,&mut restarted).unwrap().is_empty());
        s.subscriptions.timer_lead_minutes=0;s.cycles[0].state="night".into();s.cycles[0].next_state="day".into();s.cycles[0].expiry=iso(NOW+600+14400);
        assert!(observe(&mut c,&s,NOW+600,&mut initialized).unwrap().is_empty());
    }
    #[test]
    fn zero_cycle_lead_fires_at_change_only_and_stale_sources_stay_quiet() {
        let mut c=database();let mut s=status();s.fissures.clear();s.alerts.clear();s.arbitrations.clear();
        s.subscriptions.timer_lead_minutes=0;s.subscriptions.cycle_states=vec!["vallis:warm".into()];
        s.cycles=vec![Cycle{id:"vallis".into(),name:"Vallis".into(),state:"cold".into(),next_state:"warm".into(),expiry:iso(NOW+30)}];
        let mut initialized=BTreeSet::from(["cycle".into()]);
        assert!(observe(&mut c,&s,NOW,&mut initialized).unwrap().is_empty());
        s.cycles[0].state="warm".into();s.cycles[0].next_state="cold".into();s.cycles[0].expiry=iso(NOW+30+400);
        s.stale=true;assert!(observe(&mut c,&s,NOW+30,&mut initialized).unwrap().is_empty());
        s.stale=false;let notices=observe(&mut c,&s,NOW+31,&mut initialized).unwrap();assert_eq!(notices.len(),1);assert!(notices[0].body.contains("warm"));
        assert!(observe(&mut c,&s,NOW+40,&mut initialized).unwrap().is_empty());
        let mut fresh=database();let mut started=BTreeSet::from(["cycle".into()]);
        assert!(observe(&mut fresh,&s,NOW+91,&mut started).unwrap().is_empty());
    }

    #[test]
    fn rare_reward_alerts_are_per_side_and_item_once_without_startup_backfill(){
        let mut c=database();let mut s=status();s.fissures.clear();s.alerts.clear();s.arbitrations.clear();s.cycles.clear();s.subscriptions.reward_preferences.enabled=true;
        let raw=serde_json::json!({"Invasions":[{"_id":{"$oid":"inv"},"Activation":{"$date":{"$numberLong":((NOW-10)*1000).to_string()}},"Completed":false,"Node":"SolNode25","Faction":"FC_CORPUS","DefenderFaction":"FC_GRINEER","AttackerReward":{"items":["/Lotus/Types/Items/MiscItems/OrokinCatalyst"]},"DefenderReward":{"items":["/Lotus/Types/Items/MiscItems/OrokinReactor"]}}]});
        s.reward_missions=rewards::parse(&raw,NOW);let mut initialized=BTreeSet::new();assert!(observe(&mut c,&s,NOW,&mut initialized).unwrap().is_empty());
        let mut changed=raw.clone();changed["Invasions"][0]["_id"]["$oid"]=serde_json::json!("new");s.reward_missions=rewards::parse(&changed,NOW);let notices=observe(&mut c,&s,NOW+1,&mut initialized).unwrap();assert_eq!(notices.len(),2);assert!(notices.iter().all(|n|n.kind=="reward"));assert_ne!(notices[0].id,notices[1].id);
        assert!(observe(&mut c,&s,NOW+2,&mut initialized).unwrap().is_empty());initialized.clear();assert!(observe(&mut c,&s,NOW+3,&mut initialized).unwrap().is_empty());
        changed["Invasions"][0]["_id"]["$oid"]=serde_json::json!("stale-new");s.reward_missions=rewards::parse(&changed,NOW);s.stale=true;assert!(observe(&mut c,&s,NOW+4,&mut initialized).unwrap().is_empty());
    }
    #[test]
    fn enabling_unconfigured_webhook_is_rejected_and_public_settings_remain_secret_free(){
        let path=std::env::temp_dir().join(format!("myframe-delivery-{}-{}.sqlite3",std::process::id(),Utc::now().timestamp_nanos_opt().unwrap()));
        let service=WorldService::new(path.clone()).unwrap();let mut settings=Settings::default();settings.delivery.webhook_enabled=true;assert!(service.set_subscriptions(settings).is_err());assert!(!service.status().subscriptions.delivery.webhook_enabled);drop(service);let _=std::fs::remove_file(path);
    }
    #[cfg(windows)]#[test]
    fn encrypted_webhook_save_restart_and_removal_never_store_plaintext_url(){
        let path=std::env::temp_dir().join(format!("myframe-delivery-secret-{}-{}.sqlite3",std::process::id(),Utc::now().timestamp_nanos_opt().unwrap()));
        let service=WorldService::new(path.clone()).unwrap();let mut settings=Settings::default();settings.delivery.webhook_url="https://discord.com/api/webhooks/0000000000/synthetic_private_token".into();let saved=service.set_subscriptions(settings).unwrap();assert!(saved.subscriptions.delivery.webhook_configured);assert!(!serde_json::to_string(&saved).unwrap().contains("synthetic_private_token"));
        let c=db(&path).unwrap();let cipher=preference(&c,"webhook_protected").unwrap();assert!(!cipher.contains("synthetic_private_token"));assert!(!preference(&c,"settings").unwrap().contains("synthetic_private_token"));drop(c);drop(service);
        let service=WorldService::new(path.clone()).unwrap();let mut settings=service.status().subscriptions;assert!(settings.delivery.webhook_configured);settings.delivery.webhook_enabled=true;service.set_subscriptions(settings).unwrap();let mut settings=service.status().subscriptions;settings.delivery.webhook_enabled=false;settings.delivery.clear_webhook=true;let saved=service.set_subscriptions(settings).unwrap();assert!(!saved.subscriptions.delivery.webhook_configured);assert!(preference(&db(&path).unwrap(),"webhook_protected").is_none());drop(service);let _=std::fs::remove_file(path);
    }

    #[test]
    fn external_receipts_are_idempotent_persist_failures_and_do_not_retry_on_restart(){
        let path=std::env::temp_dir().join(format!("myframe-receipts-{}-{}.sqlite3",std::process::id(),Utc::now().timestamp_nanos_opt().unwrap()));let service=WorldService::new(path.clone()).unwrap();
        let notice=Notice{id:"riven-monitor:scope:stable-receipt".into(),kind:"riven-monitor".into(),title:"Synthetic query".into(),body:"Synthetic match".into(),created_at:iso(0),delivery_error:None,system_state:None};
        let first=service.publish_notice_with(notice.clone(),|_,settings,endpoint|{assert!(!settings.webhook_enabled);assert!(endpoint.is_none());Err("synthetic delivery failure".into())}).unwrap();assert_eq!(first.delivery_error.as_deref(),Some("synthetic delivery failure"));
        let duplicate=service.publish_notice_with(notice.clone(),|_,_,_|panic!("must not retry")).unwrap();assert_eq!(duplicate.delivery_error,first.delivery_error);drop(service);
        let service=WorldService::new(path.clone()).unwrap();let restored=service.publish_notice_with(notice.clone(),|_,_,_|panic!("must not retry after restart")).unwrap();assert_eq!(restored.created_at,first.created_at);assert_eq!(restored.delivery_error,first.delivery_error);
        let mut invalid=notice;invalid.kind="arbitrary".into();assert!(service.publish_notice_with(invalid,|_,_,_|panic!("invalid topic must not send")).is_err());drop(service);let _=std::fs::remove_file(path);
    }

    #[test]fn game_conversation_templates_respect_enabled_default_and_explicit_opt_out(){let mut settings=crate::world_notify::DeliverySettings::default();assert!(conversation_notice("event","A","Synthetic_Player",&settings).unwrap().is_some());settings.conversation_enabled=false;assert!(conversation_notice("event","A","Synthetic_Player",&settings).unwrap().is_none());settings.conversation_enabled=true;settings.conversation_template="Conversation from <PLAYER_NAME>".into();let notice=conversation_notice("event","A","Synthetic_Player",&settings).unwrap().unwrap();assert_eq!(notice.body,"Conversation from Synthetic_Player");assert_eq!(notice.id,"conversation:A:event");for name in ["bad player","@everyone","player/body",""]{assert!(conversation_notice("event","A",name,&settings).is_err());}settings.conversation_template.clear();assert!(conversation_notice("event","A","Valid",&settings).unwrap().is_none());}
    #[test]fn conversation_receipts_survive_restart_and_history_is_account_filtered(){
      let path=std::env::temp_dir().join(format!("myframe-conversation-{}-{}.sqlite3",std::process::id(),Utc::now().timestamp_nanos_opt().unwrap()));let service=WorldService::new(path.clone()).unwrap();let mut settings=service.status().subscriptions;settings.delivery.conversation_enabled=true;service.set_subscriptions(settings).unwrap();
      let notice=conversation_notice("stable-event","A","Synthetic_Player",&service.status().subscriptions.delivery).unwrap().unwrap();service.publish_notice_with(notice.clone(),|_,_,_|Ok(())).unwrap();assert_eq!(service.status_for_scope("A").notifications.len(),1);assert!(service.status_for_scope("B").notifications.is_empty());drop(service);let service=WorldService::new(path.clone()).unwrap();service.publish_notice_with(notice,|_,_,_|panic!("must not redeliver after restart")).unwrap();assert_eq!(service.status_for_scope("A").notifications.len(),1);assert!(service.status_for_scope("B").notifications.is_empty());drop(service);let _=std::fs::remove_file(path);
    }

    #[test]fn reward_notifications_identify_special_blueprints_and_weapon_part_parent(){assert_eq!(reward_name("/Lotus/Types/Recipes/Components/OrokinCatalystBlueprint"),"奥罗金催化剂蓝图");let name=reward_name("/Lotus/Types/Recipes/Weapons/WeaponParts/DeraVandalBarrel");assert!(name.contains("德拉"));assert!(name.contains("枪管"));}

}
