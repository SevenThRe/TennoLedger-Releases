use crate::{collection,domain};
use serde::{Deserialize,Serialize};
#[derive(Clone,Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct AccountBackup {#[serde(default,skip_serializing_if="Option::is_none")]pub inventory_changes:Option<crate::inventory_changes::Changes>,pub account_scope:String, pub data:domain::Dataset, pub collection:Option<collection::Snapshot>,#[serde(default)]pub arbitration_runs:Vec<crate::arbitration_run::Run>,#[serde(default)]pub arbitration_node_notes:std::collections::BTreeMap<String,String>}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Backup {
    pub kind:String,
    pub schema_version:u32,
    pub exported_at:String,
    #[serde(flatten)] pub data:domain::Dataset,
    pub collection:Option<collection::Snapshot>,
    #[serde(default,skip_serializing_if="Option::is_none")]pub active_account_scope:Option<String>,
    #[serde(default,skip_serializing_if="Option::is_none")]pub accounts:Option<Vec<AccountBackup>>,
}
pub fn encode(data:domain::Dataset,collection:Option<collection::Snapshot>)->Result<String,String>{
    serde_json::to_string_pretty(&Backup{kind:"myframe-backup".into(),schema_version:1,exported_at:chrono::Utc::now().to_rfc3339(),data,collection,active_account_scope:None,accounts:None}).map_err(|e|e.to_string())
}
pub fn encode_accounts(data:domain::Dataset,collection:Option<collection::Snapshot>,active:String,accounts:Vec<AccountBackup>)->Result<String,String>{
 serde_json::to_string_pretty(&Backup{kind:"myframe-backup".into(),schema_version:2,exported_at:chrono::Utc::now().to_rfc3339(),data,collection,active_account_scope:Some(active),accounts:Some(accounts)}).map_err(|e|e.to_string())
}
pub fn decode(input:&str)->Result<Backup,String>{
    if input.len()>200*1024*1024{return Err("备份文件超过200MiB".into());}
    let mut b:Backup=serde_json::from_str(input).map_err(|_|"备份格式无效")?;
    if b.kind!="myframe-backup"||!matches!(b.schema_version,1|2){return Err("备份版本不兼容".into());}
    b.data=domain::parse(&serde_json::to_string(&b.data).map_err(|e|e.to_string())?)?;
    if let Some(s)=&b.collection {collection::validate(s,&collection::catalog()?)?;}
    if b.schema_version==2 {
        let active=b.active_account_scope.as_deref().ok_or("备份缺少活动账户")?;
        let accounts=b.accounts.as_mut().ok_or("备份缺少账户档案")?;
        if accounts.is_empty()||accounts.len()>128{return Err("备份账户数量无效".into());}
        let mut seen=std::collections::BTreeSet::new();let catalog=collection::catalog()?;
        for account in accounts.iter_mut(){
            if account.arbitration_runs.len()>100000||account.arbitration_node_notes.len()>10000{return Err("仲裁备份超限".into());}
            for run in &account.arbitration_runs{crate::arbitration_history::validate(run)?;}
            for (node,note) in &account.arbitration_node_notes{if node.len()>128||note.chars().count()>4000{return Err("仲裁节点备注无效".into());}}
            let scope=&account.account_scope;
            if let Some(changes)=&account.inventory_changes{changes.validate()?;}
            if scope!=crate::account_scope::LEGACY&&!crate::account_scope::valid(scope)||!seen.insert(scope.clone()){return Err("备份账户作用域无效或重复".into());}
            account.data=domain::parse(&serde_json::to_string(&account.data).map_err(|e|e.to_string())?)?;
            if let Some(snapshot)=&account.collection{collection::validate(snapshot,&catalog)?;if snapshot.account_scope.as_deref().unwrap_or(crate::account_scope::LEGACY)!=scope{return Err("备份库存账户不一致".into());}}
        }
        let selected=accounts.iter().find(|a|a.account_scope==active).ok_or("备份活动账户不存在")?;
        // Compatibility fields always describe the selected account, never a second source of truth.
        b.data=selected.data.clone();b.collection=selected.collection.clone();
    }else if b.accounts.is_some()||b.active_account_scope.is_some(){return Err("旧备份不能携带多账户字段".into());}

    Ok(b)
}
pub fn write(path:&std::path::Path,input:&str)->Result<(),String>{
    use std::io::Write;
    let parent=path.parent().ok_or("保存路径无效")?;
    let temp=parent.join(format!(".myframe-export-{}-{}.tmp",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()));
    let result=(||{let mut f=std::fs::OpenOptions::new().write(true).create_new(true).open(&temp).map_err(|_|"无法创建导出文件")?;f.write_all(input.as_bytes()).map_err(|_|"写入导出文件失败")?;f.sync_all().map_err(|_|"保存导出文件失败")?;drop(f);std::fs::rename(&temp,path).map_err(|_|"无法保存到选定位置")?;Ok(())})();
    if result.is_err(){let _=std::fs::remove_file(&temp);}result
}
#[cfg(test)] mod tests {
    use super::*;
    #[test]fn inventory_only_backup_round_trip(){let mut s=collection::Snapshot{schema_version:1,captured_at:chrono::Utc::now().to_rfc3339(),source:"test".into(),complete:true,..Default::default()};s.counts.insert("/Lotus/Test/Item".into(),7);s.ranks.insert("/Lotus/Test/Item".into(),30);s.favorites.insert("/Lotus/Test/Item".into());let json=encode(domain::Dataset::default(),Some(s)).unwrap();let b=decode(&json).unwrap();let s=b.collection.unwrap();assert_eq!(s.counts["/Lotus/Test/Item"],7);assert_eq!(s.ranks["/Lotus/Test/Item"],30);assert!(s.favorites.contains("/Lotus/Test/Item"));assert!(b.data.trades.is_empty());}
    #[test]fn writes_and_replaces_valid_json(){let p=std::env::temp_dir().join(format!("myframe-export-test-{}.json",std::process::id()));write(&p,"{}").unwrap();let json=encode(Default::default(),None).unwrap();write(&p,&json).unwrap();decode(&std::fs::read_to_string(&p).unwrap()).unwrap();std::fs::remove_file(p).unwrap();}
}
