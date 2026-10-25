use crate::domain::{self, Dataset};
use crate::account_scope::LEGACY;
use rusqlite::{params, Connection, OptionalExtension};
pub struct Store { pub(crate) db: Connection }
fn checked_scope(scope:&str)->Result<(),String>{if scope==LEGACY||crate::account_scope::valid(scope){Ok(())}else{Err("账户作用域无效".into())}}
fn set_active(db:&Connection,scope:&str)->Result<(),String>{checked_scope(scope)?;db.execute("INSERT INTO settings(key,value) VALUES('active_account_scope',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[scope]).map_err(|e|e.to_string())?;Ok(())}
fn write_data(db:&Connection,scope:&str,data:&Dataset)->Result<(),String>{
 let json=serde_json::to_string(data).map_err(|e|e.to_string())?;
 if scope==LEGACY{db.execute("INSERT INTO documents(id,payload) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",[json])}else{db.execute("INSERT INTO account_documents(scope,payload) VALUES(?1,?2) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload",params![scope,json])}.map_err(|e|e.to_string())?;Ok(())
}
fn write_collection(db:&Connection,scope:&str,snapshot:Option<&crate::collection::Snapshot>)->Result<(),String>{
 if let Some(snapshot)=snapshot{
  if snapshot.account_scope.as_deref().unwrap_or(LEGACY)!=scope{return Err("库存账户作用域不一致".into());}
  let json=serde_json::to_string(snapshot).map_err(|e|e.to_string())?;
  if scope==LEGACY{db.execute("INSERT INTO collection(id,payload) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",[json])}else{db.execute("INSERT INTO account_collections(scope,payload) VALUES(?1,?2) ON CONFLICT(scope) DO UPDATE SET payload=excluded.payload",params![scope,json])}.map_err(|e|e.to_string())?;
 }else if scope==LEGACY{db.execute("DELETE FROM collection WHERE id=1",[]).map_err(|e|e.to_string())?;}else{db.execute("DELETE FROM account_collections WHERE scope=?1",[scope]).map_err(|e|e.to_string())?;}
 Ok(())
}
fn write_changes(db:&Connection,scope:&str,changes:&crate::inventory_changes::Changes)->Result<(),String>{changes.validate()?;let json=serde_json::to_string(changes).map_err(|e|e.to_string())?;db.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("inventory_changes:{scope}"),json]).map_err(|e|e.to_string())?;Ok(())}
impl Store {
 pub fn inventory_changes_for(&self,scope:&str)->Result<crate::inventory_changes::Changes,String>{checked_scope(scope)?;let json:Option<String>=self.db.query_row("SELECT value FROM settings WHERE key=?1",[format!("inventory_changes:{scope}")],|r|r.get(0)).optional().map_err(|e|e.to_string())?;json.map(|v|serde_json::from_str(&v).map_err(|e|e.to_string())).unwrap_or_else(||Ok(Default::default()))}
 pub fn acknowledge_inventory_changes(&self,revision:u64,expected:&str)->Result<(),String>{self.require_expected_scope(Some(expected))?;let mut changes=self.inventory_changes_for(expected)?;changes.acknowledge(revision)?;write_changes(&self.db,expected,&changes)}
 // Caller keeps AppState's database lock through the following operation.
 pub fn require_expected_scope(&self,expected:Option<&str>)->Result<(),String>{
  if let Some(expected)=expected{checked_scope(expected)?;if self.active_scope()?!=expected{return Err("账户已切换，请在当前账户重新操作".into());}}Ok(())
 }
 pub fn with_expected_scope<T>(&self,expected:Option<&str>,action:impl FnOnce(&Self)->Result<T,String>)->Result<T,String>{self.require_expected_scope(expected)?;action(self)}
 pub fn backup_to(&self,path:&std::path::Path)->Result<(),String>{self.db.execute("VACUUM INTO ?1",[path.to_string_lossy().as_ref()]).map_err(|e|e.to_string())?;Ok(())}
 pub fn active_scope(&self)->Result<String,String>{let scope:Option<String>=self.db.query_row("SELECT value FROM settings WHERE key='active_account_scope'",[],|r|r.get(0)).optional().map_err(|e|e.to_string())?;let scope=scope.unwrap_or_else(||LEGACY.into());checked_scope(&scope)?;Ok(scope)}
 fn snapshot_target(&self,snapshot:&crate::collection::Snapshot)->Result<String,String>{
  let target=snapshot.account_scope.as_deref().unwrap_or(LEGACY);checked_scope(target)?;
  if target==LEGACY&&self.active_scope()?!=LEGACY{return Err("身份未明确的库存不能覆盖已识别账户".into());}Ok(target.into())
 }
 pub fn load_collection_for_scope(&self,scope:Option<&str>)->Result<Option<crate::collection::Snapshot>,String>{
  let scope=scope.unwrap_or(LEGACY);checked_scope(scope)?;
  let json:Option<String>=if scope==LEGACY{self.db.query_row("SELECT payload FROM collection WHERE id=1",[],|r|r.get(0)).optional()}else{self.db.query_row("SELECT payload FROM account_collections WHERE scope=?1",[scope],|r|r.get(0)).optional()}.map_err(|e|e.to_string())?;
  json.map(|json|crate::collection::parse(&json)).transpose()
 }
 pub fn account_profiles(&self)->Result<Vec<crate::account_scope::Profile>,String>{
  let active=self.active_scope()?;let mut scopes=std::collections::BTreeSet::from([LEGACY.to_owned(),active.clone()]);
  let mut q=self.db.prepare("SELECT scope FROM account_documents UNION SELECT scope FROM account_collections UNION SELECT scope FROM arbitration_runs UNION SELECT scope FROM arbitration_node_notes").map_err(|e|e.to_string())?;
  for scope in q.query_map([],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?{scopes.insert(scope.map_err(|e|e.to_string())?);}
  scopes.into_iter().map(|scope|{let snapshot=self.load_collection_for_scope(Some(&scope))?;Ok(crate::account_scope::Profile{active:scope==active,unassigned:scope==LEGACY,name:snapshot.as_ref().and_then(|s|s.player_profile.as_ref()).and_then(|p|p.name.clone()),captured_at:snapshot.map(|s|s.captured_at),account_scope:scope})}).collect()
 }
 pub fn select_account(&self,scope:&str)->Result<(),String>{
  checked_scope(scope)?;
  if !self.account_profiles()?.iter().any(|profile|profile.account_scope==scope){return Err("账户档案不存在".into());}set_active(&self.db,scope)
 }
 pub fn load_collection(&self)->Result<Option<crate::collection::Snapshot>,String>{self.load_collection_for_scope(Some(&self.active_scope()?))}
 fn load_scope(&self,scope:&str)->Result<Dataset,String>{
  checked_scope(scope)?;
  let json:Option<String>=if scope==LEGACY{self.db.query_row("SELECT payload FROM documents WHERE id=1",[],|r|r.get(0)).optional()}else{self.db.query_row("SELECT payload FROM account_documents WHERE scope=?1",[scope],|r|r.get(0)).optional()}.map_err(|e|e.to_string())?;
  json.map(|json|domain::parse(&json)).transpose().map(|d|d.unwrap_or_default())
 }
 pub fn save_live_collection(&self,snapshot:&crate::collection::Snapshot)->Result<bool,String>{
  let scope=self.snapshot_target(snapshot)?;let mut data=self.load_scope(&scope)?;
  let appended=crate::app_preferences::read(&self.db)?.record_stats&&crate::asset_history::append(&mut data,snapshot)?;
  let tx=self.db.unchecked_transaction().map_err(|e|e.to_string())?;
  let mut changes=self.inventory_changes_for(&scope)?;changes.record(snapshot,&crate::collection::catalog()?)?;write_changes(&tx,&scope,&changes)?;
  write_collection(&tx,&scope,Some(snapshot))?;if appended{write_data(&tx,&scope,&data)?;}set_active(&tx,&scope)?;tx.commit().map_err(|e|e.to_string())?;Ok(appended)
 }
 pub fn save_collection(&self,snapshot:&crate::collection::Snapshot)->Result<(),String>{let scope=self.snapshot_target(snapshot)?;let tx=self.db.unchecked_transaction().map_err(|e|e.to_string())?;if self.load_collection_for_scope(Some(&scope))?.as_ref().is_none_or(|old|old.captured_at!=snapshot.captured_at||old.counts!=snapshot.counts||old.upgrade_counts_by_rank!=snapshot.upgrade_counts_by_rank){let mut changes=self.inventory_changes_for(&scope)?;changes.reset_baseline();write_changes(&tx,&scope,&changes)?;}write_collection(&tx,&scope,Some(snapshot))?;set_active(&tx,&scope)?;tx.commit().map_err(|e|e.to_string())}
 pub fn auto_collect(&self)->Result<bool,String>{let value:Option<String>=self.db.query_row("SELECT value FROM settings WHERE key='auto_collect'",[],|r|r.get(0)).optional().map_err(|e|e.to_string())?;Ok(value.as_deref()!=Some("false"))}
 pub fn set_auto_collect(&self,enabled:bool)->Result<(),String>{self.db.execute("INSERT INTO settings(key,value) VALUES('auto_collect',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[if enabled{"true"}else{"false"}]).map_err(|e|e.to_string())?;Ok(())}
 pub fn open(path:&std::path::Path)->Result<Self,String>{
  let mut db=Connection::open(path).map_err(|e|e.to_string())?;db.execute_batch("PRAGMA journal_mode=WAL;").map_err(|e|e.to_string())?;
  let tx=db.transaction().map_err(|e|e.to_string())?;
  tx.execute_batch("CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS collection(id INTEGER PRIMARY KEY CHECK(id=1),payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS account_documents(scope TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS account_collections(scope TEXT PRIMARY KEY,payload TEXT NOT NULL);").map_err(|e|e.to_string())?;
  for table in ["documents","collection","settings","account_documents","account_collections"]{
   let count:u32=tx.query_row("SELECT count(*) FROM sqlite_master WHERE name=?1 AND type='table'",[table],|r|r.get(0)).map_err(|e|e.to_string())?;
   if count!=1{return Err("数据库迁移发现不兼容结构，已保留旧档".into());}
  }
  for sql in ["SELECT id,payload FROM documents LIMIT 0","SELECT id,payload FROM collection LIMIT 0","SELECT key,value FROM settings LIMIT 0","SELECT scope,payload FROM account_documents LIMIT 0","SELECT scope,payload FROM account_collections LIMIT 0"]{tx.prepare(sql).map_err(|_|"数据库迁移发现不兼容列，已保留旧档")?;}
  crate::arbitration_history::initialize(&tx)?;
  let version:u32=tx.query_row("PRAGMA user_version",[],|r|r.get(0)).map_err(|e|e.to_string())?;if version<5{tx.execute_batch("PRAGMA user_version=5;").map_err(|e|e.to_string())?;}tx.commit().map_err(|e|e.to_string())?;Ok(Self{db})
 }
 pub fn load(&self)->Result<Dataset,String>{self.load_scope(&self.active_scope()?)}
 pub fn save(&self,data:&Dataset)->Result<(),String>{write_data(&self.db,&self.active_scope()?,data)}
 pub fn export_backup(&self)->Result<String,String>{
  let active=self.active_scope()?;let mut scopes=std::collections::BTreeSet::from([LEGACY.to_owned(),active.clone()]);
  let mut q=self.db.prepare("SELECT scope FROM account_documents UNION SELECT scope FROM account_collections UNION SELECT scope FROM arbitration_runs UNION SELECT scope FROM arbitration_node_notes").map_err(|e|e.to_string())?;
  for scope in q.query_map([],|r|r.get::<_,String>(0)).map_err(|e|e.to_string())?{scopes.insert(scope.map_err(|e|e.to_string())?);}
  let mut accounts=vec![];for scope in scopes{accounts.push(crate::backup::AccountBackup{data:self.load_scope(&scope)?,collection:self.load_collection_for_scope(Some(&scope))?,inventory_changes:Some(self.inventory_changes_for(&scope)?),arbitration_runs:crate::arbitration_history::all(self,&scope)?,arbitration_node_notes:crate::arbitration_history::node_notes(self,&scope)?,account_scope:scope});}
  crate::backup::encode_accounts(self.load()?,self.load_collection()?,active,accounts)
 }
 pub fn restore_backup(&mut self,b:&crate::backup::Backup)->Result<(),String>{
  let tx=self.db.transaction().map_err(|e|e.to_string())?;
  if let Some(accounts)=&b.accounts{
   for account in accounts{checked_scope(&account.account_scope)?;write_data(&tx,&account.account_scope,&account.data)?;write_collection(&tx,&account.account_scope,account.collection.as_ref())?;
    tx.execute("DELETE FROM arbitration_runs WHERE scope=?1",[&account.account_scope]).map_err(|e|e.to_string())?;
    tx.execute("DELETE FROM arbitration_node_notes WHERE scope=?1",[&account.account_scope]).map_err(|e|e.to_string())?;
    for input in &account.arbitration_runs{let mut run=input.clone();if run.status=="recording"{run.status="interrupted".into();run.gap("从备份恢复的未完成记录");}crate::arbitration_history::validate(&run)?;tx.execute("INSERT INTO arbitration_runs(scope,id,started,status,node,payload) VALUES(?1,?2,?3,?4,?5,?6)",params![account.account_scope,run.id,run.start_utc.as_deref().unwrap_or(""),run.status,run.node_id,serde_json::to_string(&run).map_err(|e|e.to_string())?]).map_err(|e|e.to_string())?;}
    for (node,note) in &account.arbitration_node_notes{tx.execute("INSERT INTO arbitration_node_notes(scope,node,note) VALUES(?1,?2,?3)",params![account.account_scope,node,note]).map_err(|e|e.to_string())?;}
write_changes(&tx,&account.account_scope,&account.inventory_changes.clone().unwrap_or_default())?;}
   set_active(&tx,b.active_account_scope.as_deref().ok_or("备份缺少活动账户")?)?;
  }else{
   // A v1 export has no reliable ownership proof; keep it in the preserved legacy area.
   write_data(&tx,LEGACY,&b.data)?;let mut collection=b.collection.clone();if let Some(s)=&mut collection{s.account_scope=None;}write_collection(&tx,LEGACY,collection.as_ref())?;set_active(&tx,LEGACY)?;
  }
  tx.commit().map_err(|e|e.to_string())
 }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn upgrade_backup_preserves_collection_settings_and_stats() {
        let s=Store::open(std::path::Path::new(":memory:")).unwrap();
        s.set_auto_collect(false).unwrap();
        let snapshot=crate::collection::Snapshot{schema_version:1,captured_at:chrono::Utc::now().to_rfc3339(),source:"test".into(),complete:true,..Default::default()};
        s.save_collection(&snapshot).unwrap();
        let data=Dataset::default();s.save(&data).unwrap();
        let path=std::env::temp_dir().join(format!("myframe-update-backup-{}-{}.sqlite3",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        s.backup_to(&path).unwrap();
        let restored=Store::open(&path).unwrap();
        assert!(!restored.auto_collect().unwrap());
        assert_eq!(restored.load_collection().unwrap().unwrap().source,"test");
        assert!(restored.load().unwrap().trades.is_empty());
        assert!(s.backup_to(&path).is_err(),"must not overwrite an existing rollback backup");
        drop(restored);std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn automatic_collection_preference_persists() {
        let s=Store::open(std::path::Path::new(":memory:")).unwrap();
        assert!(s.auto_collect().unwrap());
        s.set_auto_collect(false).unwrap();assert!(!s.auto_collect().unwrap());
        s.set_auto_collect(true).unwrap();assert!(s.auto_collect().unwrap());
    }
    #[test]
    fn collection_does_not_replace_stats() {
        let s = Store::open(std::path::Path::new(":memory:")).unwrap();
        let d = domain::parse(r#"{"generalDataPoints":[{"ts":"2026-01-01T00:00:00Z","plat":12}]}"#)
            .unwrap();
        s.save(&d).unwrap();
        let inventory = crate::collection::Snapshot {
            schema_version: 1,
            captured_at: "2026-10-23T00:00:00Z".into(),
            source: "test".into(),
            ..Default::default()
        };
        s.save_collection(&inventory).unwrap();
        assert_eq!(s.load().unwrap().general_data_points.len(), 1);
        assert_eq!(s.load_collection().unwrap().unwrap().source, "test");
        s.save(&domain::Dataset::default()).unwrap();
        assert!(s.load_collection().unwrap().is_some());
    }
    #[test]
    fn reopens_disk_database() {
        let path = std::env::temp_dir().join(format!(
            "myframe-storage-test-{}-{}.sqlite3",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap()
        ));
        let d = domain::parse(r#"{"generalDataPoints":[],"trades":[{"id":"test","ts":"2026-01-01T00:00:00Z","itemId":"item","name":"test","side":"sale","quantity":1,"platinum":23}]}"#).unwrap();
        {
            let s = Store::open(&path).unwrap();
            s.save(&d).unwrap();
        }
        {
            let s = Store::open(&path).unwrap();
            let saved = s.load().unwrap();
            assert_eq!(domain::analyze(&saved).revenue, 23);
        }
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn persists() {
        let s = Store::open(std::path::Path::new(":memory:")).unwrap();
        let d = domain::parse(r#"{"generalDataPoints":[{"ts":"2026-01-01T00:00:00Z","plat":12}]}"#)
            .unwrap();
        s.save(&d).unwrap();
        assert_eq!(s.load().unwrap().general_data_points.len(), 1);
        assert!(s.load().unwrap().trades.is_empty());
    }
    fn scoped(name:&str,time:&str)->crate::collection::Snapshot{
        let mut snapshot=crate::collection::Snapshot{schema_version:1,captured_at:time.into(),source:"test".into(),complete:true,account_scope:crate::account_scope::from_value(&serde_json::json!({"AccountId":format!("synthetic-private-{name}")})).unwrap(),..Default::default()};
        snapshot.counts.insert("/Lotus/Test/Item".into(),if name=="A"{7}else{2});snapshot.favorites.insert(format!("/Lotus/Test/{name}"));snapshot
    }
    fn ledger(value:u32)->Dataset{domain::parse(&format!(r#"{{"generalDataPoints":[{{"ts":"2026-01-01T00:00:00Z","plat":{value}}}]}}"#)).unwrap()}
    fn balance(store:&Store)->u64{store.load().unwrap().general_data_points[0]["plat"].as_u64().unwrap()}
    #[test]
    fn account_snapshots_favorites_ledgers_and_unknown_are_isolated(){
        let store=Store::open(std::path::Path::new(":memory:")).unwrap();store.save(&ledger(1)).unwrap();
        let a=scoped("A","2026-01-02T00:00:00Z");let b=scoped("B","2026-01-01T00:00:00Z");
        store.save_collection(&a).unwrap();assert!(store.load().unwrap().general_data_points.is_empty());store.save(&ledger(10)).unwrap();
        store.save_collection(&b).unwrap();assert!(store.load().unwrap().general_data_points.is_empty());store.save(&ledger(20)).unwrap();
        assert_eq!(store.load_collection().unwrap().unwrap().favorites,b.favorites);
        let mut unknown=a.clone();unknown.account_scope=None;assert!(store.save_collection(&unknown).is_err());assert!(store.save_live_collection(&unknown).is_err());assert_eq!(balance(&store),20);
        store.select_account(a.account_scope.as_deref().unwrap()).unwrap();assert_eq!(balance(&store),10);assert_eq!(store.load_collection().unwrap().unwrap().favorites,a.favorites);
        store.select_account(LEGACY).unwrap();assert_eq!(balance(&store),1);assert!(store.load_collection().unwrap().is_none());
        assert!(store.select_account(&"acct-v1-".to_owned()).is_err());assert_eq!(store.active_scope().unwrap(),LEGACY);
    }
    #[test]
    fn all_accounts_backup_round_trip_keeps_legacy_and_selected_scope(){
        let source=Store::open(std::path::Path::new(":memory:")).unwrap();source.save(&ledger(1)).unwrap();
        let a=scoped("A","2026-01-02T00:00:00Z");let b=scoped("B","2026-01-01T00:00:00Z");
        source.save_collection(&a).unwrap();source.save(&ledger(10)).unwrap();source.save_collection(&b).unwrap();source.save(&ledger(20)).unwrap();
        let json=source.export_backup().unwrap();assert!(!json.contains("synthetic-private"));
        let backup=crate::backup::decode(&json).unwrap();assert_eq!(backup.schema_version,2);assert_eq!(backup.accounts.as_ref().unwrap().len(),3);
        let mut restored=Store::open(std::path::Path::new(":memory:")).unwrap();restored.restore_backup(&backup).unwrap();assert_eq!(restored.active_scope().unwrap(),b.account_scope.clone().unwrap());assert_eq!(balance(&restored),20);
        restored.select_account(a.account_scope.as_deref().unwrap()).unwrap();assert_eq!(balance(&restored),10);
        restored.select_account(LEGACY).unwrap();assert_eq!(balance(&restored),1);
        // Old backups go to legacy only and do not erase identified account archives.
        let old=crate::backup::decode(&crate::backup::encode(ledger(3),None).unwrap()).unwrap();restored.restore_backup(&old).unwrap();assert_eq!(balance(&restored),3);
        restored.select_account(a.account_scope.as_deref().unwrap()).unwrap();assert_eq!(balance(&restored),10);
    }
    #[test]
    fn failed_restore_is_atomic_and_keeps_active_account(){
        let mut store=Store::open(std::path::Path::new(":memory:")).unwrap();let a=scoped("A","2026-01-02T00:00:00Z");let b=scoped("B","2026-01-01T00:00:00Z");store.save_collection(&a).unwrap();store.save(&ledger(10)).unwrap();
        let mut backup=crate::backup::decode(&store.export_backup().unwrap()).unwrap();
        backup.accounts=Some(vec![crate::backup::AccountBackup{account_scope:a.account_scope.clone().unwrap(),data:ledger(999),inventory_changes:None,collection:Some(a.clone()),arbitration_runs:vec![],arbitration_node_notes:Default::default()},crate::backup::AccountBackup{account_scope:b.account_scope.clone().unwrap(),data:ledger(888),inventory_changes:None,collection:Some(a.clone()),arbitration_runs:vec![],arbitration_node_notes:Default::default()}]);
        assert!(store.restore_backup(&backup).is_err());assert_eq!(balance(&store),10);assert_eq!(store.active_scope().unwrap(),a.account_scope.unwrap());assert!(store.load_collection_for_scope(b.account_scope.as_deref()).unwrap().is_none());
    }
    #[test]
    fn v3_migration_and_restart_preserve_original_bytes_without_claiming_legacy(){
        let path=std::env::temp_dir().join(format!("myframe-account-migrate-{}-{}.sqlite3",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let old=serde_json::to_string(&ledger(5)).unwrap();
        {let db=Connection::open(&path).unwrap();db.execute_batch("CREATE TABLE documents(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);PRAGMA user_version=3;").unwrap();db.execute("INSERT INTO documents VALUES(1,?1)",[&old]).unwrap();}
        let a=scoped("A","2026-01-02T00:00:00Z");
        {let store=Store::open(&path).unwrap();assert_eq!(store.active_scope().unwrap(),LEGACY);assert_eq!(balance(&store),5);let original:String=store.db.query_row("SELECT payload FROM documents WHERE id=1",[],|r|r.get(0)).unwrap();assert_eq!(original,old);store.save_collection(&a).unwrap();store.save(&ledger(10)).unwrap();}
        {let store=Store::open(&path).unwrap();assert_eq!(store.active_scope().unwrap(),a.account_scope.unwrap());assert_eq!(balance(&store),10);store.select_account(LEGACY).unwrap();assert_eq!(balance(&store),5);}
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn migration_failure_rolls_back_schema_and_preserves_legacy(){
        let path=std::env::temp_dir().join(format!("myframe-account-failure-{}-{}.sqlite3",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        {let db=Connection::open(&path).unwrap();db.execute_batch("CREATE TABLE documents(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);INSERT INTO documents VALUES(1,'original');CREATE VIEW account_documents AS SELECT 1 AS scope;PRAGMA user_version=3;").unwrap();}
        assert!(Store::open(&path).is_err());
        {let db=Connection::open(&path).unwrap();assert_eq!(db.query_row("SELECT payload FROM documents WHERE id=1",[],|r|r.get::<_,String>(0)).unwrap(),"original");assert_eq!(db.query_row("PRAGMA user_version",[],|r|r.get::<_,u32>(0)).unwrap(),3);assert_eq!(db.query_row("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='collection'",[],|r|r.get::<_,u32>(0)).unwrap(),0);}
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn failed_account_switch_rolls_back_snapshot_history_and_selection(){
        let store=Store::open(std::path::Path::new(":memory:")).unwrap();let a=scoped("A","2026-01-02T00:00:00Z");let mut b=scoped("B","2026-01-01T00:00:00Z");store.save_collection(&a).unwrap();store.save(&ledger(10)).unwrap();
        b.source="warframe-api-helper".into();b.player_profile=Some(crate::collection::PlayerProfile{platinum:Some(55),..Default::default()});
        store.db.execute_batch("CREATE TRIGGER reject_scope BEFORE INSERT ON settings WHEN NEW.key='active_account_scope' BEGIN SELECT RAISE(ABORT,'synthetic switch failure');END;").unwrap();
        assert!(store.save_live_collection(&b).is_err());assert_eq!(store.active_scope().unwrap(),a.account_scope.unwrap());assert_eq!(balance(&store),10);assert!(store.load_collection_for_scope(b.account_scope.as_deref()).unwrap().is_none());assert!(store.load_scope(b.account_scope.as_deref().unwrap()).unwrap().general_data_points.is_empty());
    }

    #[test]
    fn expected_scope_rejects_old_forms_before_any_read_modify_write_or_export(){
        let store=Store::open(std::path::Path::new(":memory:")).unwrap();let a=scoped("A","2026-01-02T00:00:00Z");let b=scoped("B","2026-01-01T00:00:00Z");store.save_collection(&a).unwrap();store.save(&ledger(10)).unwrap();store.save_collection(&b).unwrap();store.save(&ledger(20)).unwrap();
        let expected=a.account_scope.as_deref();let ran=std::cell::Cell::new(false);
        assert!(store.with_expected_scope(expected,|db|{ran.set(true);db.save(&ledger(999))}).is_err());assert!(!ran.get());
        assert!(store.with_expected_scope(expected,|db|crate::favorites::set(db,"/Lotus/Test/Favorite",true)).is_err());
        assert!(store.with_expected_scope(expected,|db|db.save_collection(&a)).is_err());
        assert!(store.with_expected_scope(expected,|db|db.export_backup()).is_err());
        assert_eq!(store.active_scope().unwrap(),b.account_scope.clone().unwrap());assert_eq!(balance(&store),20);assert_eq!(store.load_collection().unwrap().unwrap().favorites,b.favorites);
        assert!(store.require_expected_scope(Some(crate::account_scope::LEGACY)).is_err());assert!(store.require_expected_scope(None).is_ok());assert!(store.require_expected_scope(b.account_scope.as_deref()).is_ok());
        store.select_account(a.account_scope.as_deref().unwrap()).unwrap();assert_eq!(balance(&store),10);
    }

    #[test]fn inventory_changes_are_account_scoped_persisted_and_backed_up(){
        let mut store=Store::open(std::path::Path::new(":memory:")).unwrap();
        let make=|scope:&str,day:u32,count:u64|crate::collection::Snapshot{schema_version:1,account_scope:Some(scope.into()),captured_at:format!("2026-10-{day:02}T00:00:00Z"),source:"warframe-api-helper".into(),complete:true,counts:std::collections::BTreeMap::from([("/Lotus/Weapons/Syndicates/PerrinSequence/Pistols/PSDualCestra".into(),count)]),..Default::default()};
        let a="acct-v1-".to_owned()+&"a".repeat(64);let b="acct-v1-".to_owned()+&"b".repeat(64);
        store.save_live_collection(&make(&a,1,1)).unwrap();store.save_live_collection(&make(&a,2,4)).unwrap();let c=store.inventory_changes_for(&a).unwrap();assert_eq!(c.pending["/Lotus/Weapons/Syndicates/PerrinSequence/Pistols/PSDualCestra"].quantity,3);
        store.save_live_collection(&make(&b,1,100)).unwrap();assert!(store.inventory_changes_for(&b).unwrap().pending.is_empty());assert!(store.acknowledge_inventory_changes(c.revision,&a).is_err());
        let backup=crate::backup::decode(&store.export_backup().unwrap()).unwrap();let mut target=Store::open(std::path::Path::new(":memory:")).unwrap();target.restore_backup(&backup).unwrap();assert_eq!(target.inventory_changes_for(&a).unwrap().pending["/Lotus/Weapons/Syndicates/PerrinSequence/Pistols/PSDualCestra"].quantity,3);target.select_account(&a).unwrap();target.acknowledge_inventory_changes(c.revision,&a).unwrap();assert!(target.inventory_changes_for(&a).unwrap().pending.is_empty());
        // Explicit import establishes a fresh baseline and does not count its contents as acquisitions.
        store.save_collection(&make(&b,3,1000)).unwrap();store.save_live_collection(&make(&b,4,1001)).unwrap();assert!(store.inventory_changes_for(&b).unwrap().pending.is_empty());
    }

}
