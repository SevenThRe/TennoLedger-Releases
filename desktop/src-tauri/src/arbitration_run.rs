//! Independent, bounded EE.log event reducer. Only structured mission events are retained.
use chrono::{DateTime, NaiveDateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, sync::LazyLock};

fn re(s: &str) -> Regex {
    Regex::new(s).expect("constant log grammar")
}
static TIME: LazyLock<Regex> = LazyLock::new(|| re(r"^!?(\d+(?:\.\d+)?)\s+(?:.*?\]:\s*)?(.*)$"));
static NODE: LazyLock<Regex> =
    LazyLock::new(|| re(r"\b([A-Za-z][A-Za-z0-9]*Node\d+)(_EliteAlert)?\b"));
static NAME: LazyLock<Regex> =
    LazyLock::new(|| re(r"Mission name:\s*(.+?)\s+\(([^)]+)\)(?:\s*-\s*(Arbitration|仲裁))?\s*$"));
static TYPE: LazyLock<Regex> =
    LazyLock::new(|| re(r"(?:mission type=|missionType=|for mission )(MT_[A-Z_]+)"));
static WAVE: LazyLock<Regex> = LazyLock::new(|| {
    re(
        r"(?:WaveDefend\.lua: (?:Defense wave:|Starting wave)|LoopDefend\.lua: Loop Defense wave:)\s*(\d+)\b",
    )
});
static AGENT: LazyLock<Regex> = LazyLock::new(|| re(r"OnAgentCreated\s+(/Npc/[A-Za-z0-9_]+)"));
static POSITION: LazyLock<Regex> = LazyLock::new(|| re(r"Spawned a (/Npc/[A-Za-z0-9_]+) @ Vector\(([-+\d.eE]+),\s*([-+\d.eE]+),\s*([-+\d.eE]+)\)"));
static OBJECTIVE: LazyLock<Regex> = LazyLock::new(|| re(r"Defense avatar was spawned at position \(([-+\d.eE]+),\s*([-+\d.eE]+),\s*([-+\d.eE]+)\)"));

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
pub struct Position { pub seconds:f64, pub x:f64, pub y:f64, pub z:f64, pub kind:String, pub name:String }
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
pub struct AgentType { pub name:String, pub kind:String, pub count:u32 }
static COUNTER: LazyLock<Regex> = LazyLock::new(|| re(r"\bLive (\d+) Spawned (\d+)"));
static MIGRATION: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?i)(?:\bhost migration\b|\bHostMigration\b|\b(?:Start|Begin|Finalize)HostMigration\b)")
});

#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Interval {
    pub index: u32,
    pub kind: String,
    pub start: f64,
    pub end: Option<f64>,
    pub complete: bool,
    pub drones: u32,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub seconds: f64,
    pub kind: String,
    pub label: String,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub seconds: f64,
    pub enemies: u32,
    pub drones: u32,
    pub live: u32,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub notes: String,
    pub role: String,
    pub favorite: bool,
    pub manual_vitus: Option<u32>,
}
#[derive(Clone, Default, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Run {
    pub id: String,
    pub node_id: String,
    pub node: String,
    pub planet: String,
    pub mission_type: String,
    pub source: String,
    pub status: String,
    pub start_utc: Option<String>,
    pub end_utc: Option<String>,
    pub start_log_seconds: f64,
    pub last_log_seconds: f64,
    pub gameplay_start: Option<f64>,
    pub gameplay_end: Option<f64>,
    pub is_host: Option<bool>,
    pub start_observed: bool,
    pub has_gap: bool,
    pub drone_telemetry: bool,
    pub waves_completed: u32,
    pub reward_cycles: Option<u32>,
    pub enemy_spawns: Option<u32>,
    pub drone_spawns: u32,
    pub intervals: Vec<Interval>,
    pub timeline: Vec<Event>,
    pub samples: Vec<Sample>,
    pub drone_times: Vec<f64>,
    pub quality_notes: Vec<String>,
    #[serde(default)]
    pub positions: Vec<Position>,
    #[serde(default)]
    pub agent_types: Vec<AgentType>,
    #[serde(default)]
    pub retained_log: String,
    #[serde(default)]
    pub log_truncated: bool,
    #[serde(default)]
    pub metadata: Metadata,
}
impl Run {
    pub fn event(&mut self, t: f64, kind: &str, label: &str) {
        if self.timeline.len() < 4096 {
            self.timeline.push(Event {
                seconds: t,
                kind: kind.into(),
                label: label.into(),
            });
        }
    }
    pub fn gap(&mut self, reason: &str) {
        self.has_gap = true;
        if !self.quality_notes.iter().any(|s| s == reason) {
            self.quality_notes.push(reason.into());
        }
        self.reward_cycles = None;
    }
    pub fn duration(&self) -> Option<f64> {
        self.gameplay_start
            .map(|t| (self.gameplay_end.unwrap_or(self.last_log_seconds) - t).max(0.0))
    }
    fn complete_wave(&mut self, t: f64) {
        if let Some(w) = self
            .intervals
            .last_mut()
            .filter(|w| w.kind == "wave" && !w.complete)
        {
            w.end = Some(t);
            w.complete = true;
            self.waves_completed += 1;
        }
    }
}

fn retain_line(run:&mut Run,line:&str){
    if run.log_truncated{return;}
    if run.retained_log.len()+line.len()+1<=8*1024*1024{run.retained_log.push_str(line);run.retained_log.push('\n');}else{run.log_truncated=true;}
}

pub struct Parser {
    pub active: Option<Run>,
    pub finished: Vec<Run>,
    source: String,
    session_key: String,
    session_header: String,
    pub account_boundary: bool,
    origin: Option<DateTime<Utc>>,
    previous: Option<f64>,
    node: String,
    mission_type: String,
    host: Option<bool>,
    drones: BTreeSet<String>,
    agents: BTreeSet<String>,
    positioned: BTreeSet<String>,
    spawn_counter: Option<u32>,
    candidate: Option<(String, f64)>,
    last_activity: f64,
    last_reward: Option<f64>,
    pending: Vec<u8>,
    discard: bool,
}
impl Parser {
    pub fn new(source: &str, key: &str) -> Self {
        Self {
            active: None,
            finished: vec![],
            account_boundary: false,
            source: source.into(),
            session_key: key.into(),
            session_header: String::new(),
            origin: None,
            previous: None,
            node: String::new(),
            mission_type: String::new(),
            host: None,
            drones: BTreeSet::new(),
            agents: BTreeSet::new(),
            positioned: BTreeSet::new(),
            spawn_counter: None,
            candidate: None,
            last_activity: 0.,
            last_reward: None,
            pending: vec![],
            discard: false,
        }
    }
    pub fn feed(&mut self, bytes: &[u8]) {
        for &b in bytes {
            if b == b'\n' {
                if !self.discard {
                    let line = String::from_utf8_lossy(&self.pending).into_owned();
                    self.line(line.trim_end_matches('\r'));
                }
                self.pending.clear();
                self.discard = false;
            } else if !self.discard {
                if self.pending.len() < 1024 * 1024 {
                    self.pending.push(b);
                } else {
                    self.pending.clear();
                    self.discard = true;
                    if let Some(r) = &mut self.active {
                        r.gap("日志单行超限，已跳过");
                    }
                }
            }
        }
    }
    pub fn eof(&mut self) {
        if !self.pending.is_empty() && !self.discard {
            let line = String::from_utf8_lossy(&self.pending).into_owned();
            self.line(line.trim_end_matches('\r'));
        }
        self.pending.clear();
        self.interrupt("日志结束，未观察到任务结束");
    }
    pub fn interrupt(&mut self, reason: &str) {
        if let Some(mut r) = self.active.take() {
            if r.status == "recording" {
                r.status = "interrupted".into();
                r.gap(reason);
            }
            self.finished.push(r);
        }
        self.drones.clear();
        self.agents.clear();
        self.positioned.clear();
        self.spawn_counter = None;
        self.candidate = None;
        self.last_reward = None;
    }
    pub fn reset(&mut self, reason: &str) {
        self.interrupt(reason);
        self.origin = None;
        self.session_header.clear();
        self.previous = None;
        self.node.clear();
        self.mission_type.clear();
        self.host = None;
        self.pending.clear();
        self.discard = false;
    }
    fn utc(&self, t: f64) -> Option<String> {
        self.origin
            .map(|v| (v + chrono::Duration::milliseconds((t * 1000.) as i64)).to_rfc3339())
    }
    fn start(&mut self, t: f64) {
        self.drones.clear();
        self.agents.clear();
        self.positioned.clear();
        self.spawn_counter = None;
        self.last_reward = None;
        self.candidate = None;
        self.last_activity = t;
        let identity = format!(
            "{}:{}:{}:{:.3}",
            self.origin
                .map(|v| v.to_rfc3339())
                .unwrap_or_else(|| self.session_key.clone()),
            self.node,
            self.mission_type,
            t
        );
        let id = format!("arby-{:x}", Sha256::digest(identity.as_bytes()));
        self.active = Some(Run {
            id,
            node_id: self.node.clone(),
            mission_type: self.mission_type.clone(),
            source: self.source.clone(),
            status: "recording".into(),
            start_utc: self.utc(t),
            retained_log: self.session_header.clone(),
            start_log_seconds: t,
            last_log_seconds: t,
            is_host: self.host,
            ..Default::default()
        });
    }
    fn end(&mut self, t: f64, status: &str) {
        let utc = self.utc(t);
        if let Some(r) = &mut self.active {
            if r.status == "recording" || r.status == "ended" {
                r.status = status.into();
                r.gameplay_end = Some(t);
                r.end_utc = utc;
                r.last_log_seconds = t;
                r.event(t, "end", status);
            }
        }
    }
    pub fn line(&mut self, line: &str) {
        if self.source == "live-ee-log" && self.account_boundary {
            return;
        }
        let cap = TIME.captures(line);
        let (t, msg) = if let Some(c) = cap.as_ref() {
            let Ok(t) = c[1].parse::<f64>() else { return };
            if !t.is_finite() || t > 1e10 {
                return;
            }
            (t, c.get(2).unwrap().as_str())
        } else {
            if let Some(r)=self.active.as_mut().filter(|r|r.status=="recording"){retain_line(r,line);}
            if let Some(c) = TYPE.captures(line) {
                self.mission_type = mode(&c[1]).into();
                if let Some(r) = &mut self.active {
                    r.mission_type = self.mission_type.clone();
                }
            }
            if line.trim_start().starts_with("location=") {
                if let Some(c) = NODE.captures(line) {
                    self.node = c[1].into();
                    if let Some(r) = &mut self.active {
                        r.node_id = self.node.clone();
                    }
                }
            }
            return;
        };
        if self
            .previous
            .is_some_and(|p| t < p - 300. || (t < 2. && p > 60.))
        {
            self.reset("游戏日志时钟重置");
        }
        self.previous = Some(t);
        if let Some((_, tail)) = msg.split_once("[UTC:") {
            if let Some((date, _)) = tail.split_once(']') {
                let date = date.split_whitespace().collect::<Vec<_>>().join(" ");
                if let Ok(time) = NaiveDateTime::parse_from_str(&date, "%a %b %e %H:%M:%S %Y") {
                    self.session_header=format!("{line}\n");
                    self.origin =
                        Some(time.and_utc() - chrono::Duration::milliseconds((t * 1000.) as i64));
                }
            }
        }
        if msg.contains("LoginDone result=true") {
            self.reset("登录账户发生变化");
            self.account_boundary = true;
            return;
        }
        let loading = msg.contains("Host loading")
            || msg.contains("Host_StartMatch")
            || msg.contains("Client loading")
            || msg.contains("Client joining mission in-progress");
        if (msg.contains("Mission name:") && !NAME.is_match(msg))
            || (loading
                && !msg.contains("_EliteAlert")
                && self
                    .active
                    .as_ref()
                    .is_some_and(|r| r.status != "recording"))
        {
            self.interrupt("进入非仲裁任务");
            self.node.clear();
            self.mission_type.clear();
        }
        if let Some(c) = NODE.captures(msg) {
            if loading
                || msg.contains("Pending mission:")
                || msg.contains("Set squad mission:")
                || msg.contains("SyncAutoPopulatedConsumables")
            {
                let node = c[1].to_string();
                if loading
                    && self.active.as_ref().is_some_and(|r| {
                        r.status != "recording" || (!r.node_id.is_empty() && r.node_id != node)
                    })
                {
                    self.interrupt("进入另一任务");
                }
                self.node = node;
                if loading && c.get(2).is_some() && self.active.is_none() {
                    self.start(t);
                }
                if let Some(r) = &mut self.active {
                    if r.status == "recording" && r.node_id.is_empty() {
                        r.node_id = self.node.clone();
                    }
                }
            }
        }
        if let Some(c) = NAME.captures(msg) {
            if c.get(3).is_some() {
                if self.active.as_ref().is_some_and(|r| {
                    r.status != "recording" || (!r.node.is_empty() && r.node != c[1])
                }) {
                    self.interrupt("进入另一任务");
                }
                if self.active.is_none() {
                    self.start(t);
                }
                if let Some(r) = &mut self.active {
                    r.node = c[1].into();
                    r.planet = c[2].into();
                }
            } else {
                self.interrupt("进入非仲裁任务");
                self.node.clear();
                self.mission_type.clear();
            }
        }
        // A published arbitration schedule or vote does not constitute a started run.
        if let Some(c) = TYPE.captures(msg) {
            self.mission_type = mode(&c[1]).into();
            if let Some(r) = &mut self.active {
                r.mission_type = self.mission_type.clone();
            }
        }
        let agent = AGENT.captures(msg).map(|c| c[1].to_string());
        let drone = agent
            .as_deref()
            .is_some_and(|a| a.starts_with("/Npc/CorpusEliteShieldDroneAgent"));
        if drone && self.active.is_none() {
            self.start(t);
            if let Some(r) = &mut self.active {
                r.gap("半途开始采集，缺少任务起点");
            }
        }
        if msg.contains("Starting session on HOST") || msg.contains("Host loading") {
            self.host = Some(true);
        } else if msg.contains("Starting session on CLIENT") || msg.contains("Client loading") {
            self.host = Some(false);
        }
        let Some(r) = &mut self.active else {
            return;
        };
        if r.status != "recording" {
            if msg.contains("EIDOLONMP: Going back to hub")
                || msg.contains("Level=/Lotus/Levels/Proc/PlayerShip/")
            {
                self.interrupt("");
            }
            return;
        }
        if t < r.last_log_seconds - 1. {
            return;
        }
        if t > r.last_log_seconds + 300. {
            r.gap("日志超过五分钟没有事件");
        }
        r.last_log_seconds = r.last_log_seconds.max(t);
        retain_line(r,line);
        if let Some(c)=POSITION.captures(msg) {
            let name=c[1].to_string();
            if r.positions.len()<50000 && !self.positioned.contains(&name) {
                if let (Ok(x),Ok(y),Ok(z))=(c[2].parse::<f64>(),c[3].parse::<f64>(),c[4].parse::<f64>()) {
                    if [x,y,z].iter().all(|v|v.is_finite()&&v.abs()<1e8) {
                        self.positioned.insert(name.clone());
                        r.positions.push(Position{seconds:t,x,y,z,kind:if name.starts_with("/Npc/CorpusEliteShieldDroneAgent"){"drone"}else{"enemy"}.into(),name});
                    }
                }
            }
        }
        if let Some(c)=OBJECTIVE.captures(msg) {
            if r.positions.len()<50000 {
                if let (Ok(x),Ok(y),Ok(z))=(c[1].parse::<f64>(),c[2].parse::<f64>(),c[3].parse::<f64>()) {
                    if [x,y,z].iter().all(|v|v.is_finite()&&v.abs()<1e8) && !r.positions.iter().any(|p|p.kind=="objective"&&p.x==x&&p.y==y&&p.z==z) {
                        r.positions.push(Position{seconds:t,x,y,z,kind:"objective".into(),name:"Defense objective".into()});
                    }
                }
            }
        }
        r.is_host = self.host;
        if msg.contains("OnStateStarted, mission type=") {
            r.start_observed = true;
        }
        if (r.start_observed || !r.intervals.is_empty() || r.drone_spawns > 0)
            && MIGRATION.is_match(msg)
        {
            r.gap("房主迁移，统计可能不完整");
            r.event(t, "migration", "房主迁移");
            self.spawn_counter = None;
        }
        let wave = WAVE.captures(msg).and_then(|c| c[1].parse::<u32>().ok());
        let gameplay = wave == Some(1)
            || msg.contains("Survival: Starting survival")
            || msg.contains("PurifyMission.lua: ModeState = 2")
            || msg.contains("State Change: ENDLESS")
            || (msg.contains("Disruption: State change: ARTIFACT_ROUND")
                && !msg.contains("ARTIFACT_ROUND_DONE"))
            || (msg.contains("TerritoryMission.lua:")
                && (msg.to_lowercase().contains("control")
                    || msg.to_lowercase().contains("captured")));
        if gameplay && r.gameplay_start.is_none() {
            r.gameplay_start = Some(t);
            r.reward_cycles = if r.has_gap { None } else { Some(0) };
            r.event(t, "start", "任务计时开始");
        }
        if let Some(index) = wave {
            if !r
                .intervals
                .iter()
                .any(|w| w.kind == "wave" && w.index == index)
            {
                r.complete_wave(t);
                if r.intervals.len() < 10000 {
                    r.intervals.push(Interval {
                        index,
                        kind: "wave".into(),
                        start: t,
                        ..Default::default()
                    });
                } else {
                    r.gap("波次记录达到上限");
                }
                if r.gameplay_start.is_none() {
                    r.gap("缺少首波起点");
                }
                r.event(t, "wave", &format!("第 {index} 波"));
                self.last_activity = t;
            }
        }
        if msg.contains("WaveDefend.lua: _SleepBetweenWaves(")
            || msg.contains("Received request to open continue mission screen.")
        {
            r.complete_wave(t);
        }
        let reward = msg.contains("Survival: Gave reward tier")
            || msg.contains("Disruption: State change: ARTIFACT_ROUND_DONE")
            || msg.contains("Disruption: Endless mission reward given")
            || msg.contains("ZarimanSurvivalMission.lua: Gave reward tier")
            || (["Interception", "Infested Salvage", "Mirror Defense"]
                .contains(&r.mission_type.as_str())
                && msg.contains("Created /Lotus/Interface/DefenseReward.swf"));
        if reward && self.last_reward.is_none_or(|p| t - p > 30.) {
            self.last_reward = Some(t);
            let index = r.intervals.iter().filter(|w| w.kind == "rotation").count() as u32 + 1;
            if r.intervals.len() < 10000 {
                r.intervals.push(Interval {
                    index,
                    kind: "rotation".into(),
                    start: r.gameplay_start.unwrap_or(r.start_log_seconds),
                    end: Some(t),
                    complete: true,
                    drones: 0,
                });
            }
            r.event(t, "reward", "完成奖励轮次");
            self.last_activity = t;
        }
        if !r.has_gap && r.gameplay_start.is_some() {
            r.reward_cycles = Some(if self.last_reward.is_some() {
                r.intervals.iter().filter(|w| w.kind == "rotation").count() as u32
            } else if r.mission_type == "Mirror Defense" {
                r.waves_completed / 2
            } else if r.mission_type == "Defense" {
                r.waves_completed / 3
            } else {
                0
            });
        }
        if let Some(agent) = agent {
            if self.agents.len()<200000 && self.agents.insert(agent.clone()) {
                let name=agent.trim_start_matches("/Npc/").trim_end_matches(|c:char|c.is_ascii_digit()).to_string();
                let kind=if drone{"drone"}else{"agent"};
                if let Some(a)=r.agent_types.iter_mut().find(|a|a.name==name&&a.kind==kind){a.count=a.count.saturating_add(1);}
                else if r.agent_types.len()<2048{r.agent_types.push(AgentType{name,kind:kind.into(),count:1});}
            }
            if drone && self.drones.len() < 200000 && self.drones.insert(agent) {
                r.drone_spawns += 1;
                r.drone_times.push(t);
                r.drone_telemetry = true;
                if let Some(w) = r.intervals.last_mut() {
                    w.drones += 1;
                }
                self.last_activity = t;
            }
            if let Some(c) = COUNTER.captures(msg) {
                let live = c[1].parse::<u32>().unwrap_or(0);
                let count = c[2].parse::<u32>().unwrap_or(0);
                if let Some(prev) = self.spawn_counter {
                    if count >= prev {
                        r.enemy_spawns =
                            Some(r.enemy_spawns.unwrap_or(0).saturating_add(count - prev));
                    } else {
                        r.gap("敌人生成计数器重置");
                    }
                } else {
                    r.enemy_spawns = Some(0);
                }
                self.spawn_counter = Some(count);
                let sample = Sample {
                    seconds: t,
                    enemies: r.enemy_spawns.unwrap_or(0),
                    drones: r.drone_spawns,
                    live,
                };
                if r.samples.last().is_some_and(|s| {
                    ((s.seconds - r.start_log_seconds) / 5.).floor()
                        == ((t - r.start_log_seconds) / 5.).floor()
                }) {
                    *r.samples.last_mut().unwrap() = sample;
                } else if r.samples.len() < 12000 {
                    r.samples.push(sample);
                } else {
                    r.gap("采样数量达到上限");
                }
            }
        }
        if msg.contains("EndOfMatch.lua: Mission Succeeded") {
            self.candidate = Some(("completed".into(), t));
        } else if msg.contains("EndOfMatch.lua: Mission Failed") {
            self.candidate = Some(("failed".into(), t));
        }
        if msg.contains("TopMenu.lua: Abort:") {
            self.end(t, "aborted");
        } else if msg.contains("ExtractionTimer.lua: EOM: All players extracting") {
            self.end(t, "completed");
        } else if msg.contains("EOM missionLocationUnlocked=") || msg.contains("MISSION_SCORE ") {
            let status = self
                .candidate
                .as_ref()
                .filter(|(_, s)| t - *s <= 10. && *s >= self.last_activity)
                .map(|(v, _)| v.as_str())
                .unwrap_or("ended")
                .to_owned();
            self.end(t, &status);
        }
    }
}
fn mode(s: &str) -> &str {
    match s {
        "MT_DEFENSE" => "Defense",
        "MT_SURVIVAL" => "Survival",
        "MT_TERRITORY" => "Interception",
        "MT_PURIFY" => "Infested Salvage",
        "MT_ARTIFACT" => "Disruption",
        "MT_EXCAVATE" => "Excavation",
        "MT_MIRROR_DEFENSE" => "Mirror Defense",
        "MT_VOID_CASCADE" => "Void Cascade",
        _ => s,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires explicit local EE.log path"]
    fn local_log_spatial_replay() {
        let path=std::env::var("MYFRAME_ARBI_REPLAY_PATH").expect("set explicit input log");let bytes=std::fs::read(path).unwrap();let mut p=parser();p.feed(&bytes);p.eof();
        let positions:usize=p.finished.iter().map(|r|r.positions.len()).sum();let agents:usize=p.finished.iter().map(|r|r.agent_types.len()).sum();
        assert!(positions>0,"supplied log must contain observed positions");assert!(agents>0);
        for r in &p.finished {let encoded=serde_json::to_string(r).unwrap();let decoded:Run=serde_json::from_str(&encoded).unwrap();assert_eq!(decoded.positions.len(),r.positions.len());assert_eq!(decoded.retained_log,r.retained_log);}
        println!("runs={} positions={} named_types={}",p.finished.len(),positions,agents);
    }
    #[test]
    fn retains_real_spawn_grammar_and_deduplicates_named_creations() {
        let mut p=parser();p.feed(START.as_bytes());
        p.line("232 AI [Info]: OnAgentCreated /Npc/MacheteWomanNoCover6 Live 6 Spawned 0");
        p.line("232 AI [Info]: OnAgentCreated /Npc/MacheteWomanNoCover6 Live 6 Spawned 0");
        p.line("233 Script [Info]: WaveDefend.lua: Spawned a /Npc/MacheteWomanNoCover6 @ Vector(-19.9109, 55.1499, 78.4219), spawn point: /Layer1/NpcSpawnPoint110 @ Vector(10, 20, 30)");
        p.line("233 Script [Info]: WaveDefend.lua: Spawned a /Npc/MacheteWomanNoCover6 @ Vector(-19.9109, 55.1499, 78.4219)");
        p.line("234 Script [Info]: WaveDefend.lua: Defense avatar was spawned at position (58.300052, 55.424167, 47.160022)");
        let r=p.active.as_ref().unwrap();assert_eq!(r.positions.len(),2);assert_eq!(r.positions[0].x,-19.9109);assert_eq!(r.positions[0].kind,"enemy");assert_eq!(r.positions[1].kind,"objective");assert_eq!(r.agent_types[0].count,1);assert_eq!(r.agent_types[0].name,"MacheteWomanNoCover");
        let saved=serde_json::to_string(r).unwrap();let restored:Run=serde_json::from_str(&saved).unwrap();assert_eq!(restored.positions.len(),2);
        p.interrupt("end");p.feed(START.as_bytes());p.line("232 AI [Info]: OnAgentCreated /Npc/MacheteWomanNoCover6");assert_eq!(p.active.as_ref().unwrap().agent_types[0].count,1);
    }
    fn parser() -> Parser {
        Parser::new("import", "fixture")
    }
    #[test]fn exported_log_keeps_clock_origin_and_multiline_mission_data(){let mut p=Parser::new("import","raw");p.feed(START.as_bytes());p.line("    location=SolNode707_EliteAlert");let r=p.active.as_ref().unwrap();assert!(r.retained_log.starts_with("0.021 Sys [Diag]: Current time:"));assert!(r.retained_log.contains("Mission name:"));assert!(r.retained_log.ends_with("    location=SolNode707_EliteAlert\n"));}
    const START:&str="0.021 Sys [Diag]: Current time: [UTC: Sat Oct 24 15:09:14 2026]\n218.317 Script [Info]: ThemedSquadOverlay.lua: Mission name: Hyf (火卫二) - 仲裁\n218.317 Script [Info]: Host loading {\"name\":\"SolNode707_EliteAlert\"}\n221.862 Net [Info]: Starting session on HOST\n223.455 Game [Info]: OnStateStarted, mission type=MT_DEFENSE\n231.292 Script [Info]: WaveDefend.lua: Defense wave: 1\n";
    #[test]
    fn hyf_abort_and_fragmented_drone_dedup() {
        let mut p = parser();
        p.feed(START.as_bytes());
        p.feed(b"231.300 AI [Info]: OnAgentCreated /Npc/CorpusEliteShieldDroneAg");
        p.feed(b"ent3 Live 3 Spawned 1\n231.300 AI [Info]: OnAgentCreated /Npc/CorpusEliteShieldDroneAgent3 Live 3 Spawned 1\n");
        for i in 2..=4 {
            p.line(&format!(
                "{} Script [Info]: WaveDefend.lua: Starting wave {i}",
                231 + i * 12
            ));
        }
        p.line("280.400 Script [Info]: TopMenu.lua: Abort: host/no session");
        p.line("280.400 Sys [Info]: EOM missionLocationUnlocked=1");
        p.eof();
        let r = &p.finished[0];
        assert_eq!(r.node_id, "SolNode707");
        assert_eq!(r.status, "aborted");
        assert_eq!(r.waves_completed, 3);
        assert_eq!(r.drone_spawns, 1);
        assert_eq!(r.reward_cycles, Some(1));
        assert_eq!(r.is_host, Some(true));
        assert!((r.duration().unwrap() - 49.108).abs() < 0.001);
        assert!(r.start_utc.is_some());
    }
    #[test]
    fn schedule_does_not_create_run() {
        let mut p = parser();
        p.line("2 Script [Info]: EliteAlertMission at SolNode707 (火卫二 - Hyf)");
        p.line("3 Net [Info]: Set squad mission: SolNode707_EliteAlert");
        assert!(p.active.is_none());
    }
    #[test]
    fn sanitized_real_hyf_matches_screenshot_for_all_chunk_boundaries() {
        let bytes = include_bytes!("../../tests/fixtures/arbitration-hyf.txt");
        for size in [1, 7, 127, 65536] {
            let mut p = parser();
            for chunk in bytes.chunks(size) {
                p.feed(chunk);
            }
            p.eof();
            assert_eq!(p.finished.len(), 1);
            let r = &p.finished[0];
            assert_eq!(r.node_id, "SolNode707");
            assert_eq!(r.node, "Hyf");
            assert_eq!(r.status, "aborted");
            assert_eq!(r.waves_completed, 3);
            assert_eq!(r.drone_spawns, 4);
            assert_eq!(r.reward_cycles, Some(1));
            assert!(!r.has_gap);
            assert!((r.duration().unwrap() - 49.108).abs() < 0.00001);
        }
    }
    #[test]
    fn unknown_outcome_and_missing_telemetry() {
        let mut p = parser();
        p.feed(START.as_bytes());
        p.line("270 Sys [Info]: EOM missionLocationUnlocked=1");
        let r = p.active.unwrap();
        assert_eq!(r.status, "ended");
        assert!(!r.drone_telemetry);
    }
    #[test]
    fn outcome_requires_corroboration_and_no_recent_activity() {
        let mut p = parser();
        p.feed(START.as_bytes());
        p.line("270 Script [Info]: EndOfMatch.lua: Mission Succeeded");
        assert_eq!(p.active.as_ref().unwrap().status, "recording");
        p.line("271 Sys [Info]: MISSION_SCORE 100");
        assert_eq!(p.active.unwrap().status, "completed");
    }
    #[test]
    fn migration_and_partial_are_not_full_runs() {
        let mut p = parser();
        p.line("200 AI [Info]: OnAgentCreated /Npc/CorpusEliteShieldDroneAgent3");
        p.line("210 Net [Info]: HostMigration::Start");
        p.eof();
        let r = &p.finished[0];
        assert!(r.has_gap);
        assert_eq!(r.reward_cycles, None);
        assert_eq!(r.status, "interrupted");
    }
    #[test]
    fn live_login_boundary_discards_following_account_until_rebound() {
        let mut p = Parser::new("live-ee-log", "test");
        p.feed(START.as_bytes());
        p.feed(b"240 Script [Info]: MainMenu::LoginDone result=true\n250 Script [Info]: Mission name: Other (Deimos) - Arbitration\n251 AI [Info]: OnAgentCreated /Npc/CorpusEliteShieldDroneAgent5\n");
        assert!(p.active.is_none());
        assert!(p.account_boundary);
        assert_eq!(p.finished.len(), 1);
        assert_eq!(p.finished[0].status, "interrupted");
    }
    #[test]
    fn clock_reset_retains_checkpoint() {
        let mut p = parser();
        p.feed(START.as_bytes());
        p.line("0.021 Sys [Diag]: Current time: [UTC: Sat Oct 24 16:09:14 2026]");
        assert_eq!(p.finished[0].status, "interrupted");
        assert!(p.active.is_none());
    }
    #[test]
    fn normal_mission_after_arbitration_cannot_extend_it() {
        let mut p = parser();
        p.feed(START.as_bytes());
        p.line("250 Script [Info]: ThemedSquadOverlay.lua: Mission name: 道场");
        p.line("270 Script [Info]: WaveDefend.lua: Defense wave: 8");
        assert!(p.active.is_none());
        assert_eq!(p.finished.len(), 1);
    }
}
