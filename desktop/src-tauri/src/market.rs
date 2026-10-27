use serde_json::{json, Value};
use tauri::Manager;
use std::path::PathBuf;
use std::{
    collections::HashMap,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};
struct Gateway {
    client: reqwest::blocking::Client,
    last: Option<Instant>,
    last_riven: Option<Instant>,
    cache: HashMap<String, (Instant, Value)>,
    session: Option<Session>,
    writes: HashMap<String, Instant>,
    credential_path: Option<PathBuf>,
    restore_attempt: Option<Instant>,
    restore_allowed: bool,
    remembered: bool,
    session_error: Option<String>,
}
static GATE: OnceLock<Mutex<Gateway>> = OnceLock::new();
static SESSION_EPOCH: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
fn invalidate_presence() { SESSION_EPOCH.fetch_add(1, std::sync::atomic::Ordering::SeqCst); crate::market_presence::invalidate(); }

fn segment(s: &str) -> Result<&str, String> {
    if s.is_empty()
        || s.len() > 100
        || !s
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("无效的市场标识".into());
    }
    Ok(s)
}
// Exact public v2 attribute dictionary snapshot; these are values, never path segments.
fn attribute_slug(s: &str) -> Result<&str, String> {
    const SLUGS: &[&str] = &[
        "punch_through",
        "slash_damage",
        "impact_damage",
        "toxin_damage",
        "status_duration",
        "ammo_maximum",
        "recoil",
        "zoom",
        "channeling_damage",
        "channeling_efficiency",
        "critical_chance",
        "critical_damage",
        "base_damage_/_melee_damage",
        "heat_damage",
        "multishot",
        "reload_speed",
        "range",
        "damage_vs_corpus",
        "damage_vs_grineer",
        "puncture_damage",
        "damage_vs_infested",
        "electric_damage",
        "finisher_damage",
        "fire_rate_/_attack_speed",
        "projectile_speed",
        "magazine_capacity",
        "status_chance",
        "cold_damage",
        "combo_duration",
        "critical_chance_on_slide_attack",
        "chance_to_gain_extra_combo_count",
        "chance_to_gain_combo_count",
        "ammo_efficiency",
        "blast",
        "corrosive",
        "damage_to_orokin",
        "damage_to_scaldra",
        "damage_to_techrot",
        "gas",
        "heavy_attack_wind_up_speed",
        "magazine_reloaded_s_when_holstered",
        "magnetic",
        "melee_damage_on_heavy_attack",
        "parry_angle",
        "radiation",
        "slam_attack_damage",
        "status_damage",
        "viral",
        "weak_point_critical_chance",
        "weak_point_damage",
    ];
    if SLUGS.contains(&s) {
        Ok(s)
    } else {
        Err("未知紫卡词条标识，请更新词条目录".into())
    }
}
fn verification(profile: &Value) -> Option<bool> {
    profile.get("verification").and_then(Value::as_bool)
}
fn authorize_profile(profile: &Value, write: bool) -> Result<(), String> {
    if write {
        match verification(profile) {
            Some(true) => {}
            Some(false) => return Err("请先在Warframe Market验证游戏账户".into()),
            None => {
                return Err(
                    "市场账户响应缺少verification状态，无法确认发布权限；请重新登录或等待接口适配"
                        .into(),
                )
            }
        }
    }
    Ok(())
}
fn reputation_partner(key: &str) -> Result<String, String> {
    let partner=key.trim().to_lowercase();
    if partner.is_empty() || partner.len()>64 || matches!(partner.as_str(),"."|"..") || !partner.bytes().all(|b|b.is_ascii_alphanumeric()||matches!(b,b'_'|b'-'|b'.')) {return Err("交易对象的市场标识待核实".into());}
    Ok(partner)
}
fn route(action: &str, key: &str) -> Result<(&'static str, String, bool), String> {
    Ok(match action {
        "items" => ("GET", "/v2/items".into(), false),
        "book" => ("GET", format!("/v2/orders/item/{}", segment(key)?), false),
        "mine" => ("GET", "/v2/orders/my".into(), true),
        // Same explicit reputation contract as AlecaFrame SendWFMReputation.
        // Legacy v1 availability is not asserted; HTTP failures remain visible.
        "review" => ("POST", format!("/v1/profile/{}/review", reputation_partner(key)?), true),
        "create" => ("POST", "/v2/order".into(), true),
        "update" => ("PATCH", format!("/v2/order/{}", segment(key)?), true),
        "delete" => ("DELETE", format!("/v2/order/{}", segment(key)?), true),
        "close" => ("POST", format!("/v2/order/{}/close", segment(key)?), true),
        "auction" => (
            "GET",
            format!("/v1/auctions/entry/{}", segment(key)?),
            false,
        ),
        "auction_create" => ("POST", "/v1/auctions/create".into(), true),
        "auction_update" => ("PUT", format!("/v1/auctions/entry/{}", segment(key)?), true),
        "auction_close" => (
            "PUT",
            format!("/v1/auctions/entry/{}/close", segment(key)?),
            true,
        ),
        "auctions_mine" => ("GET", "".into(), true),
        "riven_attributes" => ("GET", "/v2/riven/attributes".into(), false),
        "riven_weapons" => ("GET", "/v2/riven/weapons".into(), false),
        "rivens" => ("GET", "/v1/auctions/search".into(), false),
        _ => return Err("不支持的市场操作".into()),
    })
}
fn validate(action: &str, body: &Value) -> Result<(), String> {
    if action=="review" {
        let o=body.as_object().ok_or("需要评价对象")?;
        if o.len()!=2 || body["review_type"].as_u64()!=Some(1) || !body["text"].as_str().is_some_and(|text|text.chars().count()<=500 && !text.contains('\0')) {return Err("评价内容无效".into());}
        return Ok(());
    }
    if action.starts_with("auction_") {
        return validate_auction(action, body);
    }
    if matches!(action, "create" | "update" | "close") {
        let o = body.as_object().ok_or("需要订单对象")?;
        for (k, v) in o {
            let max = match k.as_str() {
                "platinum" => 900000,
                "quantity" => 9999,
                "perTrade" => 6,
                "rank" | "charges" | "amberStars" | "cyanStars" => 100,
                _ => 0,
            };
            if max > 0
                && !v.as_u64().is_some_and(|n| {
                    n <= max
                        && (n > 0 || !matches!(k.as_str(), "platinum" | "quantity" | "perTrade"))
                })
            {
                return Err(format!("无效字段: {k}"));
            }
            if !matches!(
                k.as_str(),
                "itemId"
                    | "type"
                    | "platinum"
                    | "quantity"
                    | "visible"
                    | "perTrade"
                    | "rank"
                    | "charges"
                    | "subtype"
                    | "amberStars"
                    | "cyanStars"
            ) {
                return Err("未知订单字段".into());
            }
        }
        if action == "create" {
            segment(body["itemId"].as_str().ok_or("缺少物品ID")?)?;
            if !matches!(body["type"].as_str(), Some("sell" | "buy"))
                || body.get("platinum").is_none()
                || body.get("quantity").is_none()
            {
                return Err("缺少价格、数量或买卖方向".into());
            }
        }
        if action == "close" && (o.len() != 1 || body.get("quantity").is_none()) {
            return Err("成交登记需要数量".into());
        }
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn login_failures_preserve_status_and_parse_server_errors() {
        for status in [400,401,403,422,429,500,503] {
            let error=validate_login_response(status,None).unwrap_err();
            assert!(error.contains(&status.to_string()));
            assert!(!error.contains("挂单"));
            assert!(!error.contains("连接会话"));
        }
        assert!(validate_login_response(200,None).is_err());
        assert!(validate_login_response(200,Some(&json!("bad"))).is_err());
        let error=validate_login_response(401,Some(&json!({"error":{"email":["Invalid credentials"]},"token":"SECRET_RESPONSE"}))).unwrap_err();
        assert!(error.contains("401"));
        assert!(error.contains("email: Invalid credentials"));
        assert!(!error.contains("SECRET_RESPONSE"));
        let error=validate_login_response(200,Some(&json!({"errors":[{"message":"Account suspended","code":"account_suspended","password":"SECRET_RESPONSE"}]}))).unwrap_err();
        assert!(error.contains("Account suspended"));
        assert!(error.contains("account_suspended"));
        assert!(!error.contains("SECRET_RESPONSE"));
        assert!(validate_login_response(200,Some(&json!({"errors":[]}))).is_ok());
        assert!(validate_login_response(200,Some(&json!({"error":false}))).is_ok());
        assert!(validate_login_response(403,Some(&json!({"message":"Verification required"}))).unwrap_err().contains("Verification required"));
        assert!(validate_login_response(400,Some(&json!({"error":"x".repeat(1000)}))).unwrap_err().chars().count()<400);
        assert!(validate_login_response(200,Some(&json!({"payload":{},"error":null}))).is_ok());
    }
    #[test]
    #[ignore = "explicit public network smoke"]
    fn public_smoke() {
        let a = request("items".into(), "".into(), "pc".into(), "".into(), json!({})).unwrap();
        assert!(a["data"].as_array().unwrap().len() > 100);
        let core=a["data"].as_array().unwrap().iter().find(|item|item["slug"]=="legendary_fusion_core").unwrap();
        assert_eq!(core["i18n"]["zh-hans"]["name"],"传说核心");
        assert_eq!(core["i18n"]["en"]["name"],"Legendary Fusion Core");
        let cached = request("items".into(), "".into(), "pc".into(), "".into(), json!({})).unwrap();
        assert_eq!(a, cached);
        // Exercise the order-book route used by relic and mastery price quotes.
        let book = request(
            "book".into(),
            "braton_prime_set".into(),
            "pc".into(),
            "".into(),
            json!({}),
        ).unwrap();
        let orders = book["data"].as_array().expect("v2 order list");
        assert!(!orders.is_empty(), "active reference item should have orders");
        assert!(orders.iter().any(|o| {
            o["platinum"].as_u64().is_some_and(|n| n > 0)
                && o["quantity"].as_u64().is_some_and(|n| n > 0)
                && matches!(o["type"].as_str(), Some("buy" | "sell"))
                && o["user"]["status"].is_string()
        }), "orders must expose the fields used by price filtering");
        let r = request(
            "rivens".into(),
            "torid".into(),
            "pc".into(),
            "".into(),
            json!({}),
        )
        .unwrap();
        assert!(r["data"].is_array());
        // The dictionary refresh button consumes v2 slugs, names, and type/unit metadata.
        // Verify this separately from the legacy v1 auction search response above.
        let weapons = request("riven_weapons".into(), "".into(), "pc".into(), "".into(), json!({})).unwrap();
        let weapons = weapons["data"].as_array().expect("v2 riven weapons array");
        assert!(weapons.len() > 100);
        let torid = weapons.iter().find(|w| w["slug"] == "torid").expect("Torid dictionary entry");
        assert!(torid["i18n"]["en"]["name"].as_str().is_some_and(|s| !s.is_empty()));
        assert!(torid["rivenType"].as_str().is_some_and(|s| !s.is_empty()));
        let attributes = request("riven_attributes".into(), "".into(), "pc".into(), "".into(), json!({})).unwrap();
        let attributes = attributes["data"].as_array().expect("v2 riven attributes array");
        assert!(attributes.len() > 10);
        let multishot = attributes.iter().find(|a| a["slug"] == "multishot").expect("Multishot dictionary entry");
        assert!(multishot["i18n"]["en"]["name"].as_str().is_some_and(|s| !s.is_empty()));
        assert!(multishot["unit"].is_string(), "attribute unit required for correct display");
    }
    #[test]
    fn restricted_routes() {
        assert!(route("book", "../auth").is_err());
        assert!(route("login", "").is_err());
        assert_eq!(route("close", "abc").unwrap().1, "/v2/order/abc/close");
    }
    #[test]
    fn order_validation() {
        assert!(validate(
            "create",
            &json!({"itemId":"abc","type":"sell","platinum":0,"quantity":1})
        )
        .is_err());
        assert!(validate("close", &json!({"quantity":1})).is_ok());
        assert!(validate(
            "create",
            &json!({"itemId":"abc","type":"sell","platinum":12,"quantity":1})
        )
        .is_ok());
    }
}
// Plaintext account secrets stay in Rust; remembered sessions use user-bound DPAPI.
struct Session {
    token: String,
    platform: String,
    profile: Value,
}
fn new_gateway()->Gateway {
    Gateway {
            client: reqwest::blocking::Client::builder()
                .timeout(Duration::from_secs(25))
                .redirect(reqwest::redirect::Policy::none())
                .user_agent("MyFrame/0.5.0 (desktop companion)")
                .build()
                .expect("HTTP client"),
            last: None,
            last_riven: None,
            cache: HashMap::new(),
            session: None,
            writes: HashMap::new(),
            credential_path: None,
            restore_attempt: None,
            restore_allowed: true,
            remembered: false,
            session_error: None,
        }
}
fn gate() -> &'static Mutex<Gateway> {GATE.get_or_init(||Mutex::new(new_gateway()))}
fn platform_check(p: &str) -> Result<(), String> {
    if ["pc", "ps4", "xbox", "switch"].contains(&p) {
        Ok(())
    } else {
        Err("不支持的平台".into())
    }
}
fn token_check(t: &str) -> Result<String, String> {
    let t = t
        .trim()
        .strip_prefix("JWT ")
        .or_else(|| t.trim().strip_prefix("Bearer "))
        .unwrap_or(t.trim());
    if t.is_empty() || t.len() > 8192 || !t.bytes().all(|b| b.is_ascii_graphic()) {
        Err("无效会话令牌".into())
    } else {
        Ok(t.into())
    }
}
pub(super) struct PresenceCredential { pub account_id: String, pub platform: String, pub token: String, pub epoch: u64 }
pub(super) fn presence_credential(account: &str, platform: &str, write: bool) -> Result<PresenceCredential, String> {
    let g = gate().lock().map_err(|_| "网络队列锁错误")?;
    let s = g.session.as_ref().ok_or("请先登录Warframe Market")?;
    authorize_context(&s.profile, &s.platform, account, platform)?;
    authorize_profile(&s.profile, write)?;
    Ok(PresenceCredential { account_id: account.into(), platform: platform.into(), token: s.token.clone(), epoch: SESSION_EPOCH.load(std::sync::atomic::Ordering::SeqCst) })
}
pub(super) fn presence_epoch_current(epoch: u64) -> bool { SESSION_EPOCH.load(std::sync::atomic::Ordering::SeqCst) == epoch }
fn session_account_id(profile: &Value) -> Option<&str> {
    ["id", "_id", "slug"].iter().find_map(|key| profile.get(*key).and_then(Value::as_str).filter(|id| !id.trim().is_empty()))
}
fn authorize_context(profile: &Value, actual_platform: &str, expected_account: &str, expected_platform: &str) -> Result<(), String> {
    if expected_account.is_empty() || session_account_id(profile) != Some(expected_account) || actual_platform != expected_platform {
        return Err("市场账号或平台已变化，请重新预览任务".into());
    }
    Ok(())
}
fn session_view(s: Option<&Session>) -> Value {
    match s {
        Some(s) => {
            json!({"connected":true,"accountId":session_account_id(&s.profile),"sessionGeneration":SESSION_EPOCH.load(std::sync::atomic::Ordering::SeqCst),"ingameName":s.profile["ingameName"],"verified":verification(&s.profile),"verificationReason":if verification(&s.profile).is_none(){Some("账户响应未提供verification状态；读取可用，发布权限尚未确认")}else{None},"platform":s.platform})
        }
        None => json!({"connected":false}),
    }
}
fn pace(g: &mut Gateway, riven: bool) {
    if let Some(at) = g.last {
        let d = Duration::from_millis(400);
        if at.elapsed() < d {
            std::thread::sleep(d - at.elapsed());
        }
    }
    if riven {
        if let Some(at) = g.last_riven {
            let d = Duration::from_millis(6100);
            if at.elapsed() < d {
                std::thread::sleep(d - at.elapsed());
            }
        }
        g.last_riven = Some(Instant::now());
    }
    g.last = Some(Instant::now());
}
fn definite_rejection(status:u16)->bool {matches!(status,400|401|403|404|405|409|410|413|415|422|429)}
fn error_codes(body:&Value)->Vec<String>{
    fn code(value:&Value)->Option<String>{let s=value.as_str()?;
        ((s.starts_with("app.errors.")||s.starts_with("app.field."))&&s.len()<=120&&s.bytes().all(|b|b.is_ascii_alphanumeric()||matches!(b,b'.'|b'_'|b'-'))).then(||s.to_string())}
    let error=body.get("error").or_else(||body.get("errors")).unwrap_or(&Value::Null);
    let mut codes=Vec::new();if let Some(v)=code(error){codes.push(v);}
    if let Some(request)=error.get("request") {if let Some(v)=code(request){codes.push(v);}if let Some(rows)=request.as_array(){codes.extend(rows.iter().filter_map(code));}}
    if let Some(inputs)=error.get("inputs").and_then(Value::as_object){
        for (field,value) in inputs {if ["itemId","type","platinum","quantity","visible","perTrade","rank","charges","subtype","amberStars","cyanStars"].contains(&field.as_str()) {if let Some(value)=code(value){codes.push(format!("{field}: {value}"));}}}
    }
    codes.sort();codes.dedup();codes.truncate(8);codes
}
fn http_error(status:u16,body:&Value,html:bool)->String{
    let codes=error_codes(body);let lower=codes.join(" ").to_ascii_lowercase();
    let message=if lower.contains("notverified")||lower.contains("unverified") {"WM 账号尚未完成游戏账号验证"}
    else if lower.contains("banned") {"WM 限制了此账号的交易权限"}
    else if lower.contains("orderlimit") {"已达到 WM 挂单数量上限"}
    else if lower.contains("alreadyexists") {"WM 已存在相同挂单，请刷新我的订单"}
    else if status==403&&html {"WM 的网页访问检查拦截了请求，请检查网络或官网访问状态"}
    else {match status {
        400|422=>"WM 拒绝了订单字段，请检查物品、数量、价格和等级",
        401=>"登录会话已过期，请重新登录 WM",
        403=>"WM 拒绝了此操作，需检查账号权限或服务的访问限制",
        409=>"订单冲突，请刷新我的订单",
        429=>"请求过快，请稍后再试",
        _=>"请求失败；写操作请先刷新挂单，勿直接重复提交",
    }};
    let detail=if codes.is_empty(){String::new()}else{format!(" [{}]",codes.join("; "))};
    format!("市场 HTTP {status}：{message}{detail}")
}
fn response(r: reqwest::blocking::Response) -> Result<Value, String> {
    let status=r.status();if status==reqwest::StatusCode::NO_CONTENT{return Ok(Value::Null);}
    let html=r.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).is_some_and(|s|s.contains("text/html"));
    let body=r.json::<Value>();
    if !status.is_success(){return Err(http_error(status.as_u16(),&body.unwrap_or(Value::Null),html));}
    let v=body.map_err(|_|"市场响应格式异常，请先刷新挂单")?;
    if v.get("error").is_some_and(|e|!e.is_null())||v.get("errors").is_some_and(|e|!e.is_null()){
        let codes=error_codes(&v);return Err(format!("市场业务拒绝：请检查账户权限和订单字段{}",if codes.is_empty(){String::new()}else{format!(" [{}]",codes.join("; "))}));
    }
    Ok(v)
}
fn handle_market_response(g:&mut Gateway,auth:bool,write:bool,fingerprint:&str,r:reqwest::blocking::Response)->Result<Value,String>{
    let status=r.status().as_u16();
    if status==401&&auth{expire_session(g);}
    let result=response(r);
    if write&&(definite_rejection(status)||result.as_ref().err().is_some_and(|e|e.starts_with("市场业务拒绝："))){g.writes.remove(fingerprint);}
    result
}
fn expire_session(g:&mut Gateway){
    invalidate_presence();g.session=None;g.cache.clear();g.writes.clear();g.remembered=false;g.restore_allowed=false;g.restore_attempt=Some(Instant::now());
    g.session_error=Some("WM 登录已过期，请重新登录".into());
    if let Some(path)=&g.credential_path{if let Err(error)=crate::market_credentials::clear(path){g.session_error=Some(error);}}
}
fn fetch_profile(g:&mut Gateway,token:&str,platform:&str)->Result<Value,String>{
    pace(g, false);
    let mut trace=crate::diagnostics::RequestTrace::begin("session_validate",platform,true,None,&Value::Null);
    let r = g
        .client
        .get("https://api.warframe.market/v2/me")
        .bearer_auth(token)
        .header("Platform", platform)
        .header("auth_type", "header")
        .send()
        .map_err(|e|{trace.network(&e);format!("账户校验连接失败 [诊断编号 {}]",trace.id())})?;
    let status=r.status().as_u16();let html=r.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).is_some_and(|s|s.contains("text/html"));
    let result=response(r);trace.response(status,html,&result);
    let v=result.map_err(|e|format!("{e} [诊断编号 {}]",trace.id()))?;
    let profile = v.get("data").cloned().ok_or("账户响应格式变化")?;
    if profile["slug"].as_str().is_none() {
        return Err("账户缺少市场名称".into());
    }
    Ok(profile)
}
fn connect_inner(g: &mut Gateway, token: String, platform: String) -> Result<Value, String> {
    platform_check(&platform)?;
    let token = token_check(&token)?;
    let profile=fetch_profile(g,&token,&platform)?;
    invalidate_presence();
    g.session = Some(Session {
        token,
        platform,
        profile,
    });
    g.cache.clear();
    Ok(session_view(g.session.as_ref()))
}
pub(crate) fn diagnostic_state()->Value {
    match gate().lock(){Ok(g)=>json!({"connected":g.session.is_some(),"verified":g.session.as_ref().and_then(|s|verification(&s.profile)),"platform":g.session.as_ref().map(|s|s.platform.as_str()),"remembered":g.remembered,"hasSessionError":g.session_error.is_some()}),Err(_)=>json!({"unavailable":true})}
}
fn session_status(g: &Gateway) -> Value {
    let mut view=session_view(g.session.as_ref());
    view["remembered"]=json!(g.remembered);view["sessionError"]=json!(g.session_error);
    view
}
fn remember_session(g:&mut Gateway,path:PathBuf,remember:bool) {
    g.credential_path=Some(path.clone());g.restore_attempt=Some(Instant::now());
    let result=if remember {
        let session=g.session.as_ref().expect("validated login");
        crate::market_credentials::save(&path,&crate::market_credentials::SavedSession{token:session.token.clone(),platform:session.platform.clone()})
    } else {crate::market_credentials::clear(&path)};
    g.remembered=remember&&result.is_ok();g.restore_allowed=g.remembered;
    g.session_error=match result {Ok(())=>None,Err(error)=>Some(match crate::market_credentials::clear(&path){Ok(())=>error,Err(clear_error)=>format!("{error}；{clear_error}")})};
}
fn restore_session_with(g:&mut Gateway,path:Option<PathBuf>,mut connect:impl FnMut(&mut Gateway,String,String)->Result<Value,String>) {
    if let Some(path)=path {g.credential_path=Some(path);}
    if !g.restore_allowed||g.session.is_some()||g.restore_attempt.is_some_and(|at|at.elapsed()<Duration::from_secs(30)){return;}
    let Some(path)=g.credential_path.clone() else{return;};
    g.restore_attempt=Some(Instant::now());
    match crate::market_credentials::load(&path) {
        Ok(Some(saved))=>{
            g.remembered=true;
            match connect(g,saved.token,saved.platform) {
                Ok(_)=>g.session_error=None,
                Err(error) if error.starts_with("市场 HTTP 401：")=>{
                    g.remembered=false;g.restore_allowed=false;
                    g.session_error=Some(match crate::market_credentials::clear(&path){Ok(())=>"保存的 WM 登录已过期，请重新登录".into(),Err(e)=>e});
                }
                Err(error)=>g.session_error=Some(format!("暂时无法恢复 WM 登录：{error}")),
            }
        }
        Ok(None)=>{g.remembered=false;g.session_error=None;}
        Err(error)=>{g.remembered=false;g.session_error=Some(error);}
    }
}
fn restore_session(g:&mut Gateway,path:Option<PathBuf>){restore_session_with(g,path,connect_inner);}
// Do not rely on the installer or a UI unmount to flush a remembered login.
// Opted-out sessions remain memory-only; never create a second credential copy.
fn prepare_session_update(g:&Gateway,path:&std::path::Path)->Result<(),String>{
    if !g.remembered { return Ok(()); }
    if let Some(session)=&g.session {
        crate::market_credentials::save(path,&crate::market_credentials::SavedSession{
            token:session.token.clone(),platform:session.platform.clone(),
        })?;
    }
    crate::market_credentials::load(path)?.ok_or("WM 登录记录未保存，暂不安装更新，请重新登录后重试")?;
    Ok(())
}
pub(crate) fn prepare_update(path:&std::path::Path)->Result<(),String>{
    let g=gate().lock().map_err(|_|"网络队列锁错误")?;
    prepare_session_update(&g,path)
}
async fn read_session(path:Option<PathBuf>)->Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut g=gate().lock().map_err(|_|"网络队列锁错误")?;
        restore_session(&mut g,path);Ok(session_status(&g))
    }).await.map_err(|_|"账户任务失败".to_string())?
}
#[tauri::command]
pub async fn market_session(app:tauri::AppHandle) -> Result<Value, String> {
    read_session(Some(crate::market_credentials::path(&app.path().app_data_dir().map_err(|_|"登录存储位置不可用")?))).await
}
fn logout_inner(g:&mut Gateway,path:Option<PathBuf>)->Result<Value,String>{
    if let Some(path)=path{g.credential_path=Some(path);}
    invalidate_presence();g.session=None;g.cache.clear();g.writes.clear();
    g.remembered=false;g.restore_allowed=false;g.restore_attempt=Some(Instant::now());g.session_error=None;
    if let Some(path)=&g.credential_path{if let Err(error)=crate::market_credentials::clear(path){g.session_error=Some(error.clone());return Err(error);}}
    Ok(session_status(g))
}
async fn logout(path:Option<PathBuf>)->Result<Value,String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut g=gate().lock().map_err(|_|"网络队列锁错误")?;
        logout_inner(&mut g,path)
    }).await.map_err(|_|"账户任务失败".to_string())?
}
#[tauri::command]
pub async fn market_logout(app:tauri::AppHandle) -> Result<Value, String> {
    logout(Some(crate::market_credentials::path(&app.path().app_data_dir().map_err(|_|"登录存储位置不可用")?))).await
}
#[tauri::command]
pub async fn market_refresh_session(app:tauri::AppHandle)->Result<Value,String>{
    let path=crate::market_credentials::path(&app.path().app_data_dir().map_err(|_|"登录存储位置不可用")?);
    tauri::async_runtime::spawn_blocking(move||{
        let mut g=gate().lock().map_err(|_|"网络队列锁错误")?;
        if let Some(session)=&g.session {
            let token=session.token.clone();let platform=session.platform.clone();let expected=session_account_id(&session.profile).map(str::to_string);
            let result=fetch_profile(&mut g,&token,&platform);
            match result {
                Ok(profile)=>{
                    if session_account_id(&profile).map(str::to_string)!=expected{return Err("WM 账号已变化，请重新登录".into());}
                    g.session.as_mut().unwrap().profile=profile;g.session_error=None;
                }
                Err(error)=>{if error.starts_with("市场 HTTP 401："){expire_session(&mut g);}else{g.session_error=Some(error.clone());}return Err(error);}
            }
        }else{g.restore_attempt=None;restore_session(&mut g,Some(path));}
        Ok(session_status(&g))
    }).await.map_err(|_|"账户任务失败".to_string())?
}
#[tauri::command]
pub async fn market_connect(token: String, platform: String, remember:Option<bool>,app:tauri::AppHandle) -> Result<Value, String> {
    let path=crate::market_credentials::path(&app.path().app_data_dir().map_err(|_|"登录存储位置不可用")?);
    tauri::async_runtime::spawn_blocking(move || {
        let mut g = gate().lock().map_err(|_| "网络队列锁错误")?;
        connect_inner(&mut g, token, platform)?;
        remember_session(&mut g,path,remember.unwrap_or(true));Ok(session_status(&g))
    }).await.map_err(|_| "账户任务失败")?
}
#[tauri::command]
pub async fn market_login(
    email: String,
    password: String,
    platform: String,
    remember:Option<bool>,
    app:tauri::AppHandle,
) -> Result<Value, String> {
    let path=crate::market_credentials::path(&app.path().app_data_dir().map_err(|_|"登录存储位置不可用")?);
    tauri::async_runtime::spawn_blocking(move || {
        platform_check(&platform)?;
        if !email.contains('@') || email.len() > 254 || password.is_empty() || password.len() > 1024
        {
            return Err("请输入有效邮箱和密码".into());
        }
        let mut g = gate().lock().map_err(|_| "网络队列锁错误")?;
        pace(&mut g, false);
        let mut trace=crate::diagnostics::RequestTrace::begin("signin",&platform,false,None,&Value::Null);
        let r = g
            .client
            .post("https://api.warframe.market/v1/auth/signin")
            .header("Authorization", "JWT")
            .header("auth_type", "header")
            .header("Platform", &platform)
            .json(&json!({"email":email,"password":password,"auth_type":"header"}))
            .send()
            .map_err(|error| {
                trace.network(&error);
                if error.is_timeout() { "登录请求超时，请稍后重试" }
                else if error.is_connect() { "无法连接 Warframe Market，请检查网络或代理设置" }
                else { "登录请求发送失败，请检查网络连接" }
            })?;
        let token = r
            .headers()
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let status = r.status().as_u16();
        let body = r.json::<Value>().ok();
        let validation=validate_login_response(status,body.as_ref());
        trace.response(status,false,&validation.as_ref().map(|_|Value::Null).map_err(|_|"authentication_rejected".to_string()));
        validation.map_err(|message| {
            // Some upstream validation messages echo input. Never echo credentials.
            format!("{} [诊断编号 {}]",message.replace(&password,"[已隐藏]").replace(&email,"[已隐藏]"),trace.id())
        })?;
        connect_inner(
            &mut g,
            token.ok_or("登录未返回会话；请到 Warframe Market 官网检查账户状态后重试登录")?,
            platform,
        )?;
        remember_session(&mut g,path,remember.unwrap_or(true));Ok(session_status(&g))
    })
    .await
    .map_err(|_| "登录任务失败")?
}
fn validate_login_response(status: u16, body: Option<&Value>) -> Result<(), String> {
    let detail = body.map(login_error_detail).unwrap_or_default();
    if !(200..300).contains(&status) {
        let reason = match status {
            400 | 422 => "登录信息未被接受，请检查邮箱和密码",
            401 => "登录验证失败，请检查邮箱和密码",
            403 => "服务要求额外验证，请到 Warframe Market 官网检查账户状态后重试",
            429 => "登录请求过快，请稍后重试",
            500..=599 => "市场登录服务暂时不可用，请稍后重试",
            _ => "市场未接受登录请求，请稍后重试",
        };
        return Err(format!("登录 HTTP {status}：{}", if detail.is_empty() { reason } else { &detail }));
    }
    let body = body.filter(|value| value.is_object()).ok_or("登录响应格式异常，请稍后重试")?;
    if ["error", "errors"].iter().any(|key| body.get(key).is_some_and(login_has_error)) {
        return Err(format!("登录失败：{}", if detail.is_empty() { "请检查登录信息或到 Warframe Market 官网确认账户状态" } else { &detail }));
    }
    Ok(())
}
fn login_has_error(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(false) => false,
        Value::String(text) => !text.trim().is_empty(),
        Value::Array(items) => items.iter().any(login_has_error),
        Value::Object(fields) => fields.values().any(login_has_error),
        _ => true,
    }
}
fn login_error_detail(body: &Value) -> String {
    fn collect(value: &Value, label: &str, depth: usize, output: &mut Vec<String>) {
        if depth > 4 || output.len() >= 4 { return; }
        match value {
            Value::String(text) if !text.trim().is_empty() => {
                let text: String = text.chars().filter(|ch| !ch.is_control()).take(240).collect();
                let message = if label.is_empty() { text } else { format!("{label}: {text}") };
                if !output.contains(&message) { output.push(message); }
            }
            Value::Array(items) => for item in items.iter().take(4) { collect(item, label, depth + 1, output); },
            Value::Object(fields) => for (key, value) in fields {
                let normalized = key.to_ascii_lowercase();
                if ["password", "token", "authorization", "secret", "cookie", "jwt"].iter().any(|name| normalized.contains(name)) { continue; }
                let label = if ["error", "errors", "message", "detail", "code"].contains(&key.as_str()) { label } else { key.as_str() };
                collect(value, label, depth + 1, output);
            },
            _ => {},
        }
    }
    let mut messages = Vec::new();
    for key in ["error", "errors", "message", "detail"] {
        if let Some(value) = body.get(key) { collect(value, "", 0, &mut messages); }
    }
    messages.join("；").chars().take(320).collect()
}
fn validate_auction(action: &str, b: &Value) -> Result<(), String> {
    if action == "auction_close" {
        if b.as_object().is_some_and(|o| o.is_empty()) {
            return Ok(());
        }
        return Err("关闭挂单不接受字段".into());
    }
    let o = b.as_object().ok_or("需要挂单对象")?;
    for (k, v) in o {
        match k.as_str() {
            "visible" | "private" => {
                if !v.is_boolean() {
                    return Err("可见性应为布尔值".into());
                }
            }
            "starting_price" | "minimal_reputation" | "buyout_price" => {
                if !(k == "buyout_price" && v.is_null())
                    && !v
                        .as_u64()
                        .is_some_and(|n| n <= 9999999 && (k != "starting_price" || n > 0))
                {
                    return Err("无效价格或声望".into());
                }
            }
            "note" => {
                if !v.as_str().is_some_and(|s| s.chars().count() <= 500) {
                    return Err("描述过长".into());
                }
            }
            "item" if action == "auction_create" => {}
            _ => return Err(format!("不支持挂单字段: {k}")),
        }
    }
    if let (Some(start), Some(buy)) = (b["starting_price"].as_u64(), b["buyout_price"].as_u64()) {
        if buy < start {
            return Err("一口价不得低于起拍价".into());
        }
    }
    if action == "auction_create" {
        if b["starting_price"].as_u64().is_none() {
            return Err("缺少价格".into());
        }
        let i = b["item"].as_object().ok_or("缺少紫卡信息")?;
        if i.keys().any(|k| {
            ![
                "weapon_url_name",
                "name",
                "type",
                "mastery_level",
                "mod_rank",
                "re_rolls",
                "polarity",
                "attributes",
            ]
            .contains(&k.as_str())
        }) {
            return Err("未知紫卡字段".into());
        }
        segment(
            b["item"]["weapon_url_name"]
                .as_str()
                .ok_or("缺少武器标识")?,
        )?;
        if b["item"]["type"] != "riven"
            || !b["item"]["name"]
                .as_str()
                .is_some_and(|s| !s.trim().is_empty() && s.chars().count() <= 100)
        {
            return Err("无效紫卡名称或类型".into());
        }
        for (k, max) in [("mastery_level", 18), ("mod_rank", 8), ("re_rolls", 999999)] {
            if !b["item"][k]
                .as_u64()
                .is_some_and(|n| n <= max && (k != "mastery_level" || n >= 8))
            {
                return Err(format!("无效紫卡字段: {k}"));
            }
        }
        if !matches!(
            b["item"]["polarity"].as_str(),
            Some("madurai" | "vazarin" | "naramon" | "zenurik" | "unairu" | "penjaga")
        ) {
            return Err("无效极性".into());
        }
        let attrs = b["item"]["attributes"].as_array().ok_or("缺少词条")?;
        if !(2..=4).contains(&attrs.len()) {
            return Err("紫卡需要2至4条词条".into());
        }
        let mut names = std::collections::HashSet::new();
        let mut positive = 0;
        let mut negative = 0;
        for a in attrs {
            let o = a.as_object().ok_or("无效词条")?;
            if o.len() != 3
                || !a["value"]
                    .as_f64()
                    .is_some_and(|n| n.is_finite() && n.abs() <= 100000.)
            {
                return Err("无效词条数值".into());
            }
            let name = attribute_slug(a["url_name"].as_str().ok_or("缺少词条标识")?)?;
            if !names.insert(name) {
                return Err("词条重复".into());
            }
            match a["positive"].as_bool() {
                Some(true) => positive += 1,
                Some(false) => negative += 1,
                _ => return Err("词条缺少正负属性".into()),
            }
        }
        if positive < 2 || positive > 3 || negative > 1 {
            return Err("紫卡必须有2或3条正词条，最多1条负词条".into());
        }
    } else if o.is_empty() {
        return Err("没有修改字段".into());
    }
    Ok(())
}
fn search_path(key: &str, b: &Value) -> Result<String, String> {
    let weapon = b["weapon"].as_str().unwrap_or(key);
    segment(weapon)?;
    let mut url = reqwest::Url::parse("https://api.warframe.market/v1/auctions/search").unwrap();
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("type", "riven")
            .append_pair("weapon_url_name", weapon);
        let o = b.as_object().ok_or("搜索条件必须为对象")?;
        for (k, v) in o {
            match k.as_str() {
                "weapon" => {}
                "positive_stats" | "negative_stats" => {
                    let a = v.as_array().ok_or("词条筛选应为数组")?;
                    if a.len() > 3 {
                        return Err("词条筛选过多".into());
                    }
                    let mut slugs = Vec::new();
                    for s in a {
                        slugs.push(attribute_slug(s.as_str().ok_or("词条标识无效")?)?);
                    }
                    if !slugs.is_empty() {
                        q.append_pair(k, &slugs.join(","));
                    }
                }
                "mastery_rank_min" | "mastery_rank_max" | "re_rolls_min" | "re_rolls_max" => {
                    let n = v.as_u64().filter(|n| *n <= 999999).ok_or("筛选范围无效")?;
                    q.append_pair(k, &n.to_string());
                }
                "polarity" => {
                    q.append_pair(k, segment(v.as_str().ok_or("极性无效")?)?);
                }
                "buyout_policy" => {
                    if !matches!(v.as_str(), Some("direct" | "with" | "without")) {
                        return Err("无效售卖方式".into());
                    }
                    q.append_pair(k, v.as_str().unwrap());
                }
                "sort_by" => {
                    if !matches!(v.as_str(), Some("price_asc" | "price_desc")) {
                        return Err("无效排序".into());
                    }
                    q.append_pair(k, v.as_str().unwrap());
                }
                _ => return Err(format!("未知筛选条件: {k}")),
            }
        }
        if !o.contains_key("sort_by") {
            q.append_pair("sort_by", "price_asc");
        }
    }
    Ok(format!("{}?{}", url.path(), url.query().unwrap_or("")))
}

// Compare only order identity, tradable variant, price, quantity and visibility.
fn listing_order_state(value:&Value)->Result<Value,String>{
    let rows:Vec<&Value>=if let Some(rows)=value.as_array(){rows.iter().collect()}else{
        let sell=value["sell"].as_array().ok_or("卖单格式无效")?;let buy=value["buy"].as_array().ok_or("买单格式无效")?;sell.iter().chain(buy.iter()).collect()
    };
    let mut state=std::collections::BTreeMap::new();
    for row in rows{
        let id=row["id"].as_str().filter(|s|!s.is_empty()).ok_or("订单 ID 缺失")?;
        if row["itemId"].as_str().filter(|s|!s.is_empty()).is_none()||!matches!(row["type"].as_str(),Some("sell"|"buy"))||row["quantity"].as_u64().filter(|n|*n>0).is_none()||row["platinum"].as_u64().filter(|n|*n>0).is_none(){return Err("订单字段无效".into());}
        let fields=json!([row["itemId"],row["type"],row["quantity"],row["platinum"],row["visible"].as_bool().unwrap_or(true),row["rank"],row["subtype"],row["perTrade"].as_u64().unwrap_or(1),row["charges"],row["amberStars"],row["cyanStars"]]);
        if state.insert(id.to_owned(),fields).is_some(){return Err("重复订单 ID".into());}
    }
    serde_json::to_value(state).map_err(|_|"订单校验失败".into())
}

fn request(action: String, key: String, platform: String, token: String, body: Value) -> Result<Value, String> {
    request_scoped(action, key, platform, token, body, None, None, false)
}
fn request_scoped(
    action: String,
    key: String,
    platform: String,
    _token: String,
    body: Value,
    expected: Option<(String, String, Option<u64>)>,
    guards: Option<(tauri::AppHandle, Value, Value)>,
    force_refresh:bool,
) -> Result<Value, String> {
    let (method, mut path, auth) = route(&action, &key)?;
    platform_check(&platform)?;
    validate(&action, &body)?;
    if action == "rivens" {
        path = search_path(&key, &body)?;
    }
    let mut g = gate().lock().map_err(|_| "网络队列锁错误")?;
    // Compare while holding the same lock as login/logout and the actual request.
    // A UI context check alone cannot protect a queued request during an account switch.
    if let Some((account, expected_platform, generation)) = expected.as_ref() {
        if generation.is_some_and(|epoch|epoch != SESSION_EPOCH.load(std::sync::atomic::Ordering::SeqCst)) { return Err("市场会话已变化，请重新生成预览".into()); }
        let session = g.session.as_ref().ok_or("请先登录Warframe Market")?;
        authorize_context(&session.profile, &session.platform, account, expected_platform)?;
        if &platform != expected_platform { return Err("任务平台与请求平台不匹配".into()); }
    }
    if auth {
        let s = g.session.as_ref().ok_or("请先登录Warframe Market")?;
        if s.platform != platform {
            return Err("当前登录会话平台不匹配".into());
        }
        authorize_profile(&s.profile, method != "GET")?;
        if action == "auctions_mine" {
            path = format!(
                "/v1/profile/{}/auctions",
                segment(s.profile["slug"].as_str().ok_or("账户无市场标识")?)?
            );
        }
    }
    let ck = format!("{platform}{path}");
    if !auth && !force_refresh {
        if let Some((at, v)) = g.cache.get(&ck) {
            if at.elapsed() < Duration::from_secs(if action == "items" { 3600 } else { 60 }) {
                return Ok(v.clone());
            }
        }
    }
    if let Some((_, _, expected_orders)) = guards.as_ref() {
        if !matches!(action.as_str(), "create"|"update") || expected.as_ref().and_then(|v|v.2).is_none() { return Err("批量任务验证参数无效".into()); }
        let wanted=listing_order_state(expected_orders)?;
        pace(&mut g, false);
        let response=g.client.get("https://api.warframe.market/v2/orders/my").header("Platform",&platform)
            .bearer_auth(&g.session.as_ref().ok_or("请先登录")?.token).send().map_err(|_|"上架前订单核对失败；未发送变更")?;
        if !response.status().is_success(){return Err("上架前订单核对被拒绝；未发送变更".into());}
        let value:Value=response.json().map_err(|_|"上架前订单数据无效；未发送变更")?;
        if listing_order_state(value.get("data").ok_or("订单数据缺失")?)?!=wanted{return Err("订单已变化，请重新生成预览；未发送变更".into());}
    }
    let write = method != "GET";
    let fingerprint = format!("{action}:{key}:{platform}:{body}");
    if write {
        if g.writes
            .get(&fingerprint)
            .is_some_and(|at| at.elapsed() < Duration::from_secs(30))
        {
            return Err("相同写操作刚提交过；请刷新挂单确认结果后再操作".into());
        }
        if g.writes.len() > 200 {
            g.writes
                .retain(|_, at| at.elapsed() < Duration::from_secs(30));
        }
        g.writes.insert(fingerprint.clone(), Instant::now());
    }
    pace(&mut g, action == "rivens");
    if let Some((app, expected_inventory, _))=guards.as_ref(){
        let current=app.state::<crate::AppState>().0.lock().map_err(|_|"库存繁忙")?.load_collection()?.ok_or("库存不可用")?;
        let current=serde_json::to_value(current).map_err(|_|"库存校验失败")?;
        if &current!=expected_inventory{return Err("库存已变化，请重新生成预览；未发送变更".into());}
    }
    let mut trace=crate::diagnostics::RequestTrace::begin(&action,&platform,g.session.is_some(),g.session.as_ref().and_then(|s|verification(&s.profile)),&body);
    let mut req = g
        .client
        .request(
            method.parse().unwrap(),
            format!("https://api.warframe.market{path}"),
        )
        .header("Platform", &platform)
        // The public catalog returns the requested locale plus English. Keep
        // English protocol names while making Chinese labels available offline
        // from this same cached response. Account/write routes stay unchanged.
        .header("Language", if action == "items" { "zh-hans" } else { "en" })
        .header("auth_type", "header");
    if auth {
        let t = &g.session.as_ref().unwrap().token;
        req = req.header(
            "Authorization",
            format!(
                "{} {t}",
                if path.starts_with("/v2/") {
                    "Bearer"
                } else {
                    "JWT"
                }
            ),
        );
    }
    if write && method != "DELETE" && action != "auction_close" {
        req = req.json(&body);
    }
    let r = req
        .send()
        .map_err(|e|{trace.network(&e);format!("市场连接失败或超时；写操作未自动重试，请先刷新挂单 [诊断编号 {}]",trace.id())})?;
    let status=r.status().as_u16();let html=r.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v|v.to_str().ok()).is_some_and(|s|s.contains("text/html"));
    let result=handle_market_response(&mut g,auth,write,&fingerprint,r);
    trace.response(status,html,&result);
    let result=result.map_err(|e|format!("{e} [诊断编号 {}]",trace.id()))?;
    let data = if path.starts_with("/v1/") {
        match action.as_str() {
            "rivens" => result.pointer("/payload/auctions").cloned(),
            "auction" | "auction_create" | "auction_update" | "auction_close" => result
                .pointer("/payload/auction")
                .cloned()
                .or_else(|| result.get("payload").cloned()),
            "auctions_mine" => result.pointer("/payload/auctions").cloned(),
            _ => None,
        }
    } else {
        result.get("data").cloned()
    }
    .or_else(|| if write { Some(Value::Null) } else { None })
    .ok_or("市场接口格式变化")?;
    let envelope = json!({"data":data,"fetchedAt":chrono::Utc::now().to_rfc3339()});
    if !auth {
        if g.cache.len() >= 100 {
            g.cache.clear();
        }
        g.cache.insert(ck, (Instant::now(), envelope.clone()));
    } else {
        g.cache.clear();
    }
    Ok(envelope)
}
#[tauri::command]
pub async fn market_request(
    action: String,
    key: String,
    platform: String,
    token: String,
    body: Value,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || request(action, key, platform, token, body))
        .await
        .map_err(|_| "市场任务失败".to_string())?
}
#[tauri::command]
pub async fn market_request_scoped(
    action: String, key: String, platform: String, body: Value,
    expected_account: String, expected_platform: String, expected_generation: Option<u64>,
    expected_inventory:Option<Value>, expected_orders:Option<Value>, force_refresh:Option<bool>, app:tauri::AppHandle,
) -> Result<Value, String> {
    let guards=match(expected_inventory,expected_orders){(Some(inventory),Some(orders))=>Some((app,inventory,orders)),(None,None)=>None,_=>return Err("批量校验数据不完整".into())};
    tauri::async_runtime::spawn_blocking(move || request_scoped(action, key, platform, String::new(), body, Some((expected_account, expected_platform, expected_generation)),guards,force_refresh.unwrap_or(false)))
        .await.map_err(|_| "市场任务失败".to_string())?
}
#[cfg(test)]
mod bulk_context_tests {
    use super::*;
    #[test] fn listing_guard_compares_quantities_prices_variants_and_rejects_malformed_orders(){
        let row=json!({"id":"1","itemId":"item","type":"sell","quantity":2,"platinum":7});
        let a=listing_order_state(&json!([row.clone()])).unwrap();
        assert_eq!(a,listing_order_state(&json!({"sell":[row.clone()],"buy":[]})).unwrap());
        for (key,value) in [("quantity",json!(3)),("platinum",json!(8)),("rank",json!(0)),("visible",json!(false))]{let mut changed=row.clone();changed[key]=value;assert_ne!(a,listing_order_state(&json!([changed])).unwrap());}
        assert!(listing_order_state(&json!([row.clone(),row])).is_err());
        assert!(listing_order_state(&json!({"sell":[]})).is_err());
        assert!(listing_order_state(&json!([{"id":"1","quantity":0}])).is_err());
    }

    #[test]
    fn reputation_is_explicit_positive_only_and_cannot_escape_partner_path() {
        assert_eq!(route("review","Tenno.Name").unwrap().1,"/v1/profile/tenno.name/review");
        assert!(route("review","../me").is_err());assert!(route("review","..").is_err());
        assert!(validate("review",&json!({"review_type":1,"text":"Thanks"})).is_ok());
        assert!(validate("review",&json!({"review_type":-1,"text":""})).is_err());
        assert!(validate("review",&json!({"review_type":1,"text":"x".repeat(501)})).is_err());
    }

    #[test]
    fn task_identity_uses_stable_id_and_refuses_changed_account_or_platform() {
        let profile = json!({"id":"stable-a", "slug":"slug-a", "ingameName":"Name"});
        assert_eq!(session_account_id(&profile), Some("stable-a"));
        assert!(authorize_context(&profile, "pc", "stable-a", "pc").is_ok());
        assert!(authorize_context(&profile, "pc", "stable-b", "pc").is_err());
        assert!(authorize_context(&profile, "xbox", "stable-a", "pc").is_err());
        assert!(authorize_context(&json!({}), "pc", "", "pc").is_err());
    }
    #[test]
    fn session_public_view_exposes_identity_but_not_token() {
        let session = Session { token:"SECRET".into(), platform:"pc".into(), profile:json!({"id":"a"}) };
        let view = session_view(Some(&session));
        assert_eq!(view["accountId"], "a"); assert!(!view.to_string().contains("SECRET"));
    }
}
#[cfg(test)]
mod riven_tests {
    use super::*;
    fn listing() -> Value {
        json!({"visible":true,"private":false,"starting_price":100,"buyout_price":100,"minimal_reputation":0,"note":"","item":{"weapon_url_name":"torid","name":"Visi-crita","type":"riven","mastery_level":12,"mod_rank":8,"re_rolls":3,"polarity":"madurai","attributes":[{"url_name":"base_damage_/_melee_damage","value":123.4,"positive":true},{"url_name":"critical_chance","value":100.0,"positive":true}]}})
    }
    #[test]
    fn create_requires_valid_riven() {
        let mut b = listing();
        assert!(validate_auction("auction_create", &b).is_ok());
        b["item"]["mod_rank"] = json!(9);
        assert!(validate_auction("auction_create", &b).is_err());
        b = listing();
        b["item"]["attributes"][1]["url_name"] = json!("base_damage_/_melee_damage");
        assert!(validate_auction("auction_create", &b).is_err());
        b = listing();
        b["buyout_price"] = json!(90);
        assert!(validate_auction("auction_create", &b).is_err());
    }
    #[test]
    fn update_does_not_replace_item() {
        assert!(validate_auction("auction_update", &listing()).is_err());
        assert!(validate_auction("auction_update", &json!({"visible":false})).is_ok());
        assert!(validate_auction("auction_update", &json!({})).is_err());
        assert!(validate_auction("auction_close", &json!({})).is_ok());
    }
    #[test]
    fn search_whitelist_and_encoding() {
        let p = search_path(
            "torid",
            &json!({"positive_stats":["base_damage_/_melee_damage","critical_chance"],"buyout_policy":"direct"}),
        )
        .unwrap();
        assert!(p.contains("positive_stats=base_damage_%2F_melee_damage%2Ccritical_chance"));
        assert!(search_path("torid", &json!({"url":"https://evil.test"})).is_err());
        assert!(search_path("../auth", &json!({})).is_err());
    }
    #[test]
    fn session_view_never_returns_secret() {
        let s = Session {
            token: "TOP_SECRET".into(),
            platform: "pc".into(),
            profile: json!({"slug":"example","ingameName":"Example","verification":true}),
        };
        let v = session_view(Some(&s));
        assert_eq!(v["connected"], true);
        assert!(!v.to_string().contains("TOP_SECRET"));
        assert!(token_check("JWT abc\r\ndef").is_err());
    }
    #[test]
    fn auction_routes_use_observed_v1_contract() {
        assert_eq!(route("auction_close", "abc").unwrap().0, "PUT");
        assert_eq!(
            route("auction_update", "abc").unwrap().1,
            "/v1/auctions/entry/abc"
        );
        assert!(route("auction_delete", "abc").is_err());
    }
}
#[cfg(test)]
mod permission_tests {
    use super::*;
    #[test]
    fn real_slash_attributes_are_values_not_paths() {
        for slug in ["base_damage_/_melee_damage", "fire_rate_/_attack_speed"] {
            assert!(attribute_slug(slug).is_ok());
            assert!(segment(slug).is_err());
            let p = search_path("torid", &json!({"positive_stats":[slug]})).unwrap();
            assert!(p.contains("%2F"));
        }
        assert!(attribute_slug("../../auth").is_err());
        assert!(attribute_slug("invented_stat").is_err());
    }
    #[test]
    fn read_permission_does_not_require_verification() {
        assert!(authorize_profile(&json!({}), false).is_ok());
        assert!(authorize_profile(&json!({"verification":false}), false).is_ok());
        assert!(authorize_profile(&json!({}), true)
            .unwrap_err()
            .contains("verification"));
        assert!(authorize_profile(&json!({"verification":false}), true).is_err());
        assert!(authorize_profile(&json!({"verification":true}), true).is_ok());
        let s = Session {
            token: "secret".into(),
            platform: "pc".into(),
            profile: json!({"slug":"example"}),
        };
        assert!(session_view(Some(&s))["verified"].is_null());
        assert!(session_view(Some(&s))["verificationReason"].is_string());
    }
}

#[cfg(test)]
mod async_session_tests {
    #[test]
    fn async_session_first_load_is_safe() {
        // Run this filtered test in a fresh process to exercise OnceLock initialization.
        tauri::async_runtime::block_on(async {
            assert_eq!(super::read_session(None).await.unwrap()["connected"], false);
            assert_eq!(super::logout(None).await.unwrap()["connected"], false);
        });
    }
}

#[cfg(test)] mod rejection_tests {
    use super::*;
    #[test] fn forbidden_errors_keep_machine_reason_without_inventing_verification_failure(){
        let error=http_error(403,&json!({"error":{"request":["app.errors.forbidden"]}}),false);
        assert!(error.contains("app.errors.forbidden"));assert!(!error.contains("账号未验证"));
        assert!(http_error(403,&json!({"error":{"request":["app.errors.notVerified"]}}),false).contains("尚未完成"));
        assert!(http_error(403,&Value::Null,true).contains("网页访问检查"));
        let secret="synthetic-private-jwt";let error=http_error(403,&json!({"error":{"request":[secret],"inputs":{"password":secret,"platinum":"app.field.tooSmall"}},"message":secret}),false);
        assert!(!error.contains(secret));assert!(error.contains("platinum: app.field.tooSmall"));
    }
    #[test] fn only_definite_rejections_release_write_deduplication(){
        for status in [400,401,403,404,405,409,410,413,415,422,429]{assert!(definite_rejection(status));}
        for status in [200,408,500,502,503,504]{assert!(!definite_rejection(status));}
    }
}

#[cfg(all(test,windows))] mod remembered_session_tests {
    #[test] fn update_flush_restores_missing_record_and_new_gateway_recovers_it(){
        let (mut g,path)=fixture();remember_session(&mut g,path.clone(),true);
        crate::market_credentials::clear(&path).unwrap();
        prepare_session_update(&g,&path).unwrap();
        let mut restarted=new_gateway();restore_session_with(&mut restarted,Some(path.clone()),connected);
        assert!(restarted.session.is_some());assert!(restarted.remembered);
        logout_inner(&mut restarted,None).unwrap();std::fs::remove_dir(path.parent().unwrap()).unwrap();
    }
    #[test] fn update_does_not_persist_opted_out_sessions(){
        let (g,path)=fixture();prepare_session_update(&g,&path).unwrap();assert!(!path.exists());
    }
    #[test] fn update_blocks_if_remembered_record_cannot_be_read_or_written(){
        let (mut g,path)=fixture();remember_session(&mut g,path.clone(),true);
        g.session=None;crate::market_credentials::clear(&path).unwrap();
        assert!(prepare_session_update(&g,&path).is_err());
        std::fs::remove_dir(path.parent().unwrap()).unwrap();
    }
    use super::*;
    fn fixture()->(Gateway,PathBuf){
        let directory=std::env::temp_dir().join(format!("wm-session-state-{}-{}",std::process::id(),chrono::Utc::now().timestamp_nanos_opt().unwrap()));
        let path=crate::market_credentials::path(&directory);let mut g=new_gateway();
        g.session=Some(Session{token:"synthetic-native-only-token".into(),platform:"pc".into(),profile:json!({"id":"fixture-user","slug":"fixture-user","verification":true})});
        (g,path)
    }
    fn connected(g:&mut Gateway,token:String,platform:String)->Result<Value,String>{
        assert_eq!(token,"synthetic-native-only-token");assert_eq!(platform,"pc");
        g.session=Some(Session{token,platform,profile:json!({"id":"fixture-user","slug":"fixture-user","verification":true})});Ok(session_view(g.session.as_ref()))
    }
    #[test] fn remember_opt_out_and_logout_clear_only_the_encrypted_session(){
        let (mut g,path)=fixture();remember_session(&mut g,path.clone(),true);assert!(g.remembered);assert!(path.exists());
        let view=session_status(&g).to_string();assert!(!view.contains("synthetic-native-only-token"));assert!(!view.contains("password"));
        remember_session(&mut g,path.clone(),false);assert!(!path.exists());assert!(!g.remembered);assert!(g.session.is_some());
        remember_session(&mut g,path.clone(),true);let view=logout_inner(&mut g,None).unwrap();assert_eq!(view["connected"],false);assert!(!path.exists());
        std::fs::remove_dir(path.parent().unwrap()).unwrap();
    }
    #[test] fn saved_login_is_validated_once_and_network_failure_preserves_it_for_retry(){
        let (mut g,path)=fixture();remember_session(&mut g,path.clone(),true);
        let mut restored=new_gateway();restore_session_with(&mut restored,Some(path.clone()),|_,_,_|Err("账户校验连接失败".into()));
        assert!(restored.session.is_none());assert!(restored.remembered);assert!(path.exists());
        restore_session_with(&mut restored,None,|_,_,_|panic!("transient failure must be throttled"));
        restored.restore_attempt=None;restore_session_with(&mut restored,None,connected);assert!(restored.session.is_some());assert!(restored.session_error.is_none());
        restore_session_with(&mut restored,None,|_,_,_|panic!("connected session must not reconnect"));
        logout_inner(&mut restored,None).unwrap();std::fs::remove_dir(path.parent().unwrap()).unwrap();
    }
    #[test] fn logout_never_restores_a_saved_login_when_file_removal_fails(){
        let (mut g,path)=fixture();std::fs::create_dir_all(&path).unwrap();g.credential_path=Some(path.clone());
        assert!(logout_inner(&mut g,None).is_err());assert!(g.session.is_none());assert!(!g.restore_allowed);assert!(g.session_error.is_some());
        g.restore_attempt=None;restore_session_with(&mut g,Some(path.clone()),|_,_,_|panic!("logout must not auto-authenticate"));
        std::fs::remove_dir(&path).unwrap();std::fs::remove_dir(path.parent().unwrap()).unwrap();
    }
    #[test] fn expired_saved_login_is_removed_without_repeated_authentication(){
        let (mut g,path)=fixture();remember_session(&mut g,path.clone(),true);
        let mut restored=new_gateway();restore_session_with(&mut restored,Some(path.clone()),|_,_,_|Err("市场 HTTP 401：expired".into()));
        assert!(restored.session.is_none());assert!(!restored.remembered);assert!(!path.exists());assert!(restored.session_error.as_deref().unwrap().contains("过期"));
        std::fs::remove_dir(path.parent().unwrap()).unwrap();
    }
}

#[cfg(test)] mod http_rejection_tests {
    use super::*;
    fn http_response(status:u16,body:&str)->reqwest::blocking::Response{
        use std::io::{Read,Write};
        let listener=std::net::TcpListener::bind("127.0.0.1:0").unwrap();let address=listener.local_addr().unwrap();
        let body=body.to_string();let server=std::thread::spawn(move||{let(mut stream,_)=listener.accept().unwrap();let mut input=[0;4096];stream.read(&mut input).unwrap();write!(stream,"HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len()).unwrap();});
        let response=reqwest::blocking::Client::builder().no_proxy().build().unwrap().get(format!("http://{address}")).send().unwrap();server.join().unwrap();response
    }
    #[test] fn real_http_refusal_releases_dedup_but_server_failure_keeps_the_guard(){
        let mut g=new_gateway();let key="synthetic-order";g.writes.insert(key.into(),Instant::now());
        let refused=http_response(403,r#"{"data":null,"error":{"request":["app.errors.forbidden"]}}"#);
        assert!(handle_market_response(&mut g,true,true,key,refused).unwrap_err().contains("app.errors.forbidden"));assert!(!g.writes.contains_key(key));
        g.writes.insert(key.into(),Instant::now());let unknown=http_response(503,"{}");
        assert!(handle_market_response(&mut g,true,true,key,unknown).is_err());assert!(g.writes.contains_key(key));
    }
}
