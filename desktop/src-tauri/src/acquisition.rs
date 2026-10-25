//! Source selection is separate from parsing and process access.
use crate::collection::Snapshot;

#[derive(Debug, PartialEq)]
pub enum Decision { Accept, Unchanged, Older, LivePreferred, Incomplete, InvalidTime, UnknownIdentity }
fn is_live(source:&str)->bool {matches!(source,"game-memory"|"warframe-api-helper")}
pub fn choose(old:Option<&Snapshot>,next:&Snapshot,live_recent:bool)->Decision {
    let Ok(time)=chrono::DateTime::parse_from_rfc3339(&next.captured_at) else{return Decision::InvalidTime;};
    if time.signed_duration_since(chrono::Utc::now()).num_seconds()>120 {return Decision::InvalidTime;}
    if is_live(&next.source)&&!next.complete {return Decision::Incomplete;}
    if old.is_some_and(|old|old.account_scope.is_some()&&next.account_scope.is_none()){return Decision::UnknownIdentity;}
    let switched=old.is_some_and(|old|old.account_scope!=next.account_scope);
    if switched&&next.source=="alecaframe-cache"&&old.is_some_and(|old|old.account_scope.is_some()){return Decision::LivePreferred;}
    if switched{return Decision::Accept;}
    if live_recent && next.source=="alecaframe-cache" {return Decision::LivePreferred;}
    let Some(old)=old else{return Decision::Accept;};
    if let Ok(previous)=chrono::DateTime::parse_from_rfc3339(&old.captured_at) {
        if time<previous {return Decision::Older;}
        if time==previous&&is_live(&old.source)&&next.source=="alecaframe-cache" {return Decision::LivePreferred;}
    }
    // Include profile, mastery aggregates and optional account flags, not just counts.
    if serde_json::to_value(old).ok()==serde_json::to_value(next).ok(){Decision::Unchanged}else{Decision::Accept}
}

#[cfg(test)] mod tests {
    use super::*;
    fn snapshot(source:&str,time:&str)->Snapshot{Snapshot{schema_version:1,captured_at:time.into(),source:source.into(),complete:true,..Default::default()}}
    #[test] fn cache_bootstrap_then_live_then_no_regression(){
        let cache=snapshot("alecaframe-cache","2026-01-01T00:00:00Z");assert_eq!(choose(None,&cache,false),Decision::Accept);
        let mut live=snapshot("game-memory","2026-01-01T01:00:00Z");live.counts.insert("a".into(),2);
        assert_eq!(choose(Some(&cache),&live,false),Decision::Accept);
        assert_eq!(choose(Some(&live),&cache,false),Decision::Older);
        let same=snapshot("alecaframe-cache","2026-01-01T01:00:00Z");assert_eq!(choose(Some(&live),&same,false),Decision::LivePreferred);
        let newer=snapshot("alecaframe-cache","2026-01-01T02:00:00Z");assert_eq!(choose(Some(&live),&newer,true),Decision::LivePreferred);assert_eq!(choose(Some(&live),&newer,false),Decision::Accept);
    }
    #[test] fn partial_native_rejected_and_same_time_changes_accepted(){let a=snapshot("game-memory","2026-01-01T01:00:00Z");let mut b=a.clone();b.counts.insert("a".into(),3);assert_eq!(choose(Some(&a),&b,true),Decision::Accept);b.complete=false;assert_eq!(choose(Some(&a),&b,true),Decision::Incomplete);assert_eq!(choose(Some(&a),&a,true),Decision::Unchanged);}
    #[test] fn metadata_updates_are_not_lost(){let a=snapshot("game-memory","2026-01-01T01:00:00Z");let mut b=a.clone();b.helminth=Some(Default::default());assert_eq!(choose(Some(&a),&b,false),Decision::Accept);}
    #[test] fn helper_replaces_cache_but_partial_and_older_results_do_not(){
        let cache=snapshot("alecaframe-cache","2026-01-01T00:00:00Z");
        let mut live=snapshot("warframe-api-helper","2026-01-01T01:00:00Z");
        assert_eq!(choose(Some(&cache),&live,false),Decision::Accept);
        assert_eq!(choose(Some(&live),&cache,false),Decision::Older);
        assert_eq!(choose(Some(&live),&live,true),Decision::Unchanged);
        live.complete=false;assert_eq!(choose(Some(&cache),&live,false),Decision::Incomplete);
    }
    #[test] fn different_accounts_do_not_share_time_or_live_preference(){
        let mut a=snapshot("warframe-api-helper","2026-01-02T00:00:00Z");a.account_scope=crate::account_scope::from_value(&serde_json::json!({"AccountId":"A"})).unwrap();
        let mut b=snapshot("warframe-api-helper","2026-01-01T00:00:00Z");b.account_scope=crate::account_scope::from_value(&serde_json::json!({"AccountId":"B"})).unwrap();
        assert_eq!(choose(Some(&a),&b,true),Decision::Accept);
        b.source="alecaframe-cache".into();assert_eq!(choose(Some(&a),&b,false),Decision::LivePreferred);
        b.account_scope=None;b.source="warframe-api-helper".into();assert_eq!(choose(Some(&a),&b,false),Decision::UnknownIdentity);
        let active=a.account_scope.as_deref().unwrap();
        assert!(!crate::account_scope::source_may_select(active,None,"warframe-api-helper"));
        assert!(!crate::account_scope::source_may_select(active,Some("another"),"alecaframe-cache"));
        assert!(crate::account_scope::source_may_select(active,Some(active),"alecaframe-cache"));
        assert!(crate::account_scope::source_may_select(active,Some("another"),"warframe-api-helper"));
    }

}
