use crate::{
    arbitration_run::{Metadata, Run},
    store::Store,
};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

pub fn initialize(db: &rusqlite::Connection) -> Result<(), String> {
    db.execute_batch("CREATE TABLE IF NOT EXISTS arbitration_runs(scope TEXT NOT NULL,id TEXT NOT NULL,started TEXT NOT NULL,status TEXT NOT NULL,node TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(scope,id)); CREATE INDEX IF NOT EXISTS arbitration_runs_date ON arbitration_runs(scope,started DESC); CREATE TABLE IF NOT EXISTS arbitration_node_notes(scope TEXT NOT NULL,node TEXT NOT NULL,note TEXT NOT NULL,PRIMARY KEY(scope,node));").map_err(|e|e.to_string())
}
pub fn validate(r: &Run) -> Result<(), String> {
    if r.id.len() != 69
        || !r.id.starts_with("arby-")
        || !r.id[5..].bytes().all(|v| v.is_ascii_hexdigit())
        || r.node_id.len() > 128
        || r.node.len() > 256
        || r.planet.len() > 128
        || r.mission_type.len() > 128
        || r.intervals.len() > 10000
        || r.timeline.len() > 4096
        || r.samples.len() > 12000
        || r.drone_times.len() > 200000
        || r.positions.len() > 50000
        || r.agent_types.len() > 2048
        || r.retained_log.len() > 8*1024*1024
        || r.positions.iter().any(|p| ![p.seconds,p.x,p.y,p.z].iter().all(|n|n.is_finite()) || p.name.len()>256 || !["enemy","drone","objective"].contains(&p.kind.as_str()))
        || r.agent_types.iter().any(|a|a.name.len()>256 || !["enemy","drone","agent"].contains(&a.kind.as_str()))
        || r.quality_notes.len() > 64
        || !r.start_log_seconds.is_finite()
        || !r.last_log_seconds.is_finite()
        || r.last_log_seconds < r.start_log_seconds
        || ![
            "recording",
            "completed",
            "failed",
            "aborted",
            "ended",
            "interrupted",
        ]
        .contains(&r.status.as_str())
    {
        return Err("仲裁记录格式无效".into());
    }
    validate_metadata(&r.metadata)?;
    Ok(())
}
pub fn validate_metadata(m: &Metadata) -> Result<(), String> {
    if m.notes.chars().count() > 4000
        || m.role.chars().count() > 80
        || m.manual_vitus.is_some_and(|v| v > 1_000_000)
    {
        Err("仲裁备注或数量超限".into())
    } else {
        Ok(())
    }
}
pub fn get(db: &Store, scope: &str, id: &str) -> Result<Option<Run>, String> {
    let json: Option<String> = db
        .db
        .query_row(
            "SELECT payload FROM arbitration_runs WHERE scope=?1 AND id=?2",
            params![scope, id],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    json.map(|v| serde_json::from_str(&v).map_err(|_| "仲裁记录损坏".into()))
        .transpose()
}
pub fn save(db: &Store, scope: &str, input: &Run) -> Result<bool, String> {
    validate(input)?;
    let old = get(db, scope, &input.id)?;
    let mut r = input.clone();
    if let Some(old) = &old {
        r.metadata = old.metadata.clone();
        if old.status != "recording" && r.status == "recording" {
            return Ok(false);
        }
        if old.last_log_seconds > r.last_log_seconds {
            return Ok(false);
        }
        // Importing an older-schema backup must not erase retained evidence.
        if r.retained_log.is_empty() {r.retained_log=old.retained_log.clone();r.log_truncated=old.log_truncated;}
        if r.positions.is_empty() {r.positions=old.positions.clone();}
        if r.agent_types.is_empty() {r.agent_types=old.agent_types.clone();}
    }
    let started = r.start_utc.as_deref().unwrap_or("");
    let payload = serde_json::to_string(&r).map_err(|e| e.to_string())?;
    db.db.execute("INSERT INTO arbitration_runs(scope,id,started,status,node,payload) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(scope,id) DO UPDATE SET started=excluded.started,status=excluded.status,node=excluded.node,payload=excluded.payload",params![scope,r.id,started,r.status,r.node_id,payload]).map_err(|e|e.to_string())?;
    Ok(old.is_none())
}
pub fn recover(db: &Store) -> Result<(), String> {
    let mut q = db
        .db
        .prepare("SELECT scope,payload FROM arbitration_runs WHERE status='recording'")
        .map_err(|e| e.to_string())?;
    let values = q
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(q);
    for (scope, payload) in values {
        let mut r: Run = serde_json::from_str(&payload).map_err(|_| "仲裁检查点损坏")?;
        r.status = "interrupted".into();
        r.gap("程序退出后恢复的检查点");
        save(db, &scope, &r)?;
    }
    Ok(())
}
#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Filter {
    pub search: String,
    pub status: String,
    pub favorites_only: bool,
    pub offset: u32,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub runs: Vec<Run>,
    pub total: u32,
}
pub fn list(db: &Store, scope: &str, f: &Filter) -> Result<Page, String> {
    if f.search.len() > 256 || f.status.len() > 32 {
        return Err("仲裁筛选无效".into());
    }
    let needle = f.search.to_lowercase();
    let mut q = db
        .db
        .prepare(
            "SELECT payload FROM arbitration_runs WHERE scope=?1 ORDER BY started DESC,id DESC",
        )
        .map_err(|e| e.to_string())?;
    let mut runs = vec![];
    let mut total = 0;
    for value in q
        .query_map([scope], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
    {
        let mut r: Run =
            serde_json::from_str(&value.map_err(|e| e.to_string())?).map_err(|_| "仲裁记录损坏")?;
        if (!f.status.is_empty() && f.status != r.status)
            || (f.favorites_only && !r.metadata.favorite)
            || (!needle.is_empty()
                && !format!(
                    "{} {} {} {} {}",
                    r.node, r.node_id, r.mission_type, r.metadata.role, r.metadata.notes
                )
                .to_lowercase()
                .contains(&needle))
        {
            continue;
        }
        if total >= f.offset && runs.len() < 50 {
            r.retained_log.clear();
            r.positions.clear();
            runs.push(r);
        }
        total += 1;
    }
    Ok(Page { runs, total })
}
pub fn all(db: &Store, scope: &str) -> Result<Vec<Run>, String> {
    let mut q = db
        .db
        .prepare("SELECT payload FROM arbitration_runs WHERE scope=?1 ORDER BY started")
        .map_err(|e| e.to_string())?;
    let rows = q
        .query_map([scope], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|v| {
        serde_json::from_str(&v.map_err(|e| e.to_string())?).map_err(|_| "仲裁记录损坏".into())
    })
    .collect()
}
pub fn node_notes(
    db: &Store,
    scope: &str,
) -> Result<std::collections::BTreeMap<String, String>, String> {
    let mut q = db
        .db
        .prepare("SELECT node,note FROM arbitration_node_notes WHERE scope=?1")
        .map_err(|e| e.to_string())?;
    let rows = q
        .query_map([scope], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<_, _>>().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::arbitration_run::Parser;
    fn run() -> Run {
        let mut p = Parser::new("import", "test");
        p.line("10 Script [Info]: Mission name: Hyf (Deimos) - Arbitration");
        p.line("20 Script [Info]: TopMenu.lua: Abort:");
        p.eof();
        p.finished.remove(0)
    }
    #[test]
    fn isolation_dedupe_metadata_and_restart() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let r = run();
        assert!(save(&db, "scope-a", &r).unwrap());
        assert!(!save(&db, "scope-a", &r).unwrap());
        assert!(get(&db, "scope-b", &r.id).unwrap().is_none());
        let mut edited = r.clone();
        edited.metadata.notes = "标记".into();
        db.db
            .execute(
                "UPDATE arbitration_runs SET payload=?1",
                [serde_json::to_string(&edited).unwrap()],
            )
            .unwrap();
        save(&db, "scope-a", &r).unwrap();
        assert_eq!(
            get(&db, "scope-a", &r.id).unwrap().unwrap().metadata.notes,
            "标记"
        );
        assert_eq!(list(&db, "scope-a", &Filter::default()).unwrap().total, 1);
    }
    #[test]
    fn reimport_upgrades_legacy_evidence_without_duplicate_or_later_erasure() {
        let db=Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut legacy=run();legacy.retained_log.clear();save(&db,"scope-a",&legacy).unwrap();
        let mut enriched=legacy.clone();enriched.retained_log="retained source line\n".into();
        enriched.positions.push(crate::arbitration_run::Position{seconds:12.,x:1.,y:2.,z:3.,kind:"enemy".into(),name:"test".into()});
        assert!(!save(&db,"scope-a",&enriched).unwrap());
        save(&db,"scope-a",&legacy).unwrap();let restored=get(&db,"scope-a",&legacy.id).unwrap().unwrap();
        assert_eq!(restored.retained_log,enriched.retained_log);assert_eq!(restored.positions.len(),1);
        let page=list(&db,"scope-a",&Filter::default()).unwrap();assert_eq!(page.total,1);assert!(page.runs[0].retained_log.is_empty());assert!(page.runs[0].positions.is_empty());
    }
    #[test]
    fn crash_checkpoint_is_interrupted() {
        let db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut r = run();
        r.status = "recording".into();
        save(&db, "scope-a", &r).unwrap();
        recover(&db).unwrap();
        assert_eq!(
            get(&db, "scope-a", &r.id).unwrap().unwrap().status,
            "interrupted"
        );
    }
    #[test]
    fn backup_preserves_history_metadata_node_notes_and_old_backups() {
        let mut db = Store::open(std::path::Path::new(":memory:")).unwrap();
        let mut r = run();
        r.metadata.notes = "单局备注".into();
        save(&db, crate::account_scope::LEGACY, &r).unwrap();
        db.db
            .execute(
                "INSERT INTO arbitration_node_notes VALUES(?1,?2,?3)",
                params![crate::account_scope::LEGACY, "SolNode707", "节点备注"],
            )
            .unwrap();
        let backup = crate::backup::decode(&db.export_backup().unwrap()).unwrap();
        let mut restored = Store::open(std::path::Path::new(":memory:")).unwrap();
        restored.restore_backup(&backup).unwrap();
        assert_eq!(
            get(&restored, crate::account_scope::LEGACY, &r.id)
                .unwrap()
                .unwrap()
                .metadata
                .notes,
            "单局备注"
        );
        assert_eq!(
            node_notes(&restored, crate::account_scope::LEGACY).unwrap()["SolNode707"],
            "节点备注"
        );
        let old = crate::backup::decode(&crate::backup::encode(Default::default(), None).unwrap())
            .unwrap();
        db.restore_backup(&old).unwrap();
        assert!(get(&db, crate::account_scope::LEGACY, &r.id)
            .unwrap()
            .is_some());
    }
}
