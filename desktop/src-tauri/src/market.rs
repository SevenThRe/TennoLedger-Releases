use serde_json::{json, Value};
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
    fn login_failures_never_show_order_instructions_or_server_secrets() {
        for status in [400,401,403,422,429,500,503] {
            let error=validate_login_response(status,None).unwrap_err();
            assert!(error.contains(&status.to_string()));
            assert!(!error.contains("挂单"));
            assert!(!error.contains("连接会话"));
        }
        assert!(validate_login_response(200,None).is_err());
        assert!(validate_login_response(200,Some(&json!("bad"))).is_err());
        let error=validate_login_response(200,Some(&json!({"error":"SECRET_RESPONSE"}))).unwrap_err();
        assert!(!error.contains("SECRET_RESPONSE"));
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
// Account secrets remain exclusively in this process; never returned to the webview.
struct Session {
    token: String,
    platform: String,
    profile: Value,
}
fn gate() -> &'static Mutex<Gateway> {
    GATE.get_or_init(|| {
        Mutex::new(Gateway {
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
        })
    })
}
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
fn response(r: reqwest::blocking::Response) -> Result<Value, String> {
    let status = r.status();
    if status==reqwest::StatusCode::NO_CONTENT {return Ok(Value::Null);}
    if !status.is_success() {
        return Err(format!(
            "市场 HTTP {}：{}",
            status.as_u16(),
            match status.as_u16() {
                400 => "字段无效或操作不允许",
                401 => "登录失败或会话过期",
                403 => "账号未验证或服务要求额外验证；请到官网完成验证后连接会话",
                409 => "订单冲突，请刷新我的挂单",
                429 => "请求过快，请稍后再试",
                _ => "请求失败；写操作请先刷新挂单，勿直接重复提交",
            }
        ));
    }
    let v: Value = r.json().map_err(|_| "市场响应格式异常，请先刷新挂单")?;
    if v.get("error").is_some_and(|e| !e.is_null()) || v.get("errors").is_some_and(|e| !e.is_null())
    {
        return Err("市场业务拒绝：请检查账户验证、价格、词条或挂单数量上限".into());
    }
    Ok(v)
}
fn connect_inner(g: &mut Gateway, token: String, platform: String) -> Result<Value, String> {
    platform_check(&platform)?;
    let token = token_check(&token)?;
    pace(g, false);
    let r = g
        .client
        .get("https://api.warframe.market/v2/me")
        .bearer_auth(&token)
        .header("Platform", &platform)
        .header("auth_type", "header")
        .send()
        .map_err(|_| "账户校验连接失败")?;
    let v = response(r)?;
    let profile = v.get("data").cloned().ok_or("账户响应格式变化")?;
    if profile["slug"].as_str().is_none() {
        return Err("账户缺少市场名称".into());
    }
    invalidate_presence();
    g.session = Some(Session {
        token,
        platform,
        profile,
    });
    g.cache.clear();
    Ok(session_view(g.session.as_ref()))
}
#[tauri::command]
pub async fn market_session() -> Result<Value, String> {
    let g = gate().lock().map_err(|_| "网络队列锁错误")?;
    Ok(session_view(g.session.as_ref()))
}
#[tauri::command]
pub async fn market_logout() -> Result<Value, String> {
    let mut g = gate().lock().map_err(|_| "网络队列锁错误")?;
    invalidate_presence();
    g.session = None;
    g.cache.clear();
    g.writes.clear();
    Ok(session_view(None))
}
#[tauri::command]
pub async fn market_connect(token: String, platform: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut g = gate().lock().map_err(|_| "网络队列锁错误")?;
        connect_inner(&mut g, token, platform)
    })
    .await
    .map_err(|_| "账户任务失败")?
}
#[tauri::command]
pub async fn market_login(
    email: String,
    password: String,
    platform: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        platform_check(&platform)?;
        if !email.contains('@') || email.len() > 254 || password.is_empty() || password.len() > 1024
        {
            return Err("请输入有效邮箱和密码".into());
        }
        let mut g = gate().lock().map_err(|_| "网络队列锁错误")?;
        pace(&mut g, false);
        let r = g
            .client
            .post("https://api.warframe.market/v1/auth/signin")
            .header("Authorization", "JWT")
            .header("auth_type", "header")
            .header("Platform", &platform)
            .json(&json!({"email":email,"password":password,"auth_type":"header"}))
            .send()
            .map_err(|_| "登录连接失败；未自动重试")?;
        let token = r
            .headers()
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let status = r.status().as_u16();
        if !(200..300).contains(&status) {
            return validate_login_response(status, None).map(|_| Value::Null);
        }
        let body = r.json::<Value>().ok();
        validate_login_response(status, body.as_ref())?;
        connect_inner(
            &mut g,
            token.ok_or("登录未返回会话；请到 Warframe Market 官网检查账户状态后重试登录")?,
            platform,
        )
    })
    .await
    .map_err(|_| "登录任务失败")?
}
fn validate_login_response(status: u16, body: Option<&Value>) -> Result<(), String> {
    if !(200..300).contains(&status) {
        let reason = match status {
            400 | 422 => "登录信息未被接受，请检查邮箱和密码",
            401 => "登录验证失败，请检查邮箱和密码",
            403 => "服务要求额外验证，请到 Warframe Market 官网检查账户状态后重试",
            429 => "登录请求过快，请稍后重试",
            500..=599 => "市场登录服务暂时不可用，请稍后重试",
            _ => "市场未接受登录请求，请稍后重试",
        };
        return Err(format!("登录 HTTP {status}：{reason}"));
    }
    let body = body.filter(|value| value.is_object()).ok_or("登录响应格式异常，请稍后重试")?;
    if ["error", "errors"].iter().any(|key| body.get(key).is_some_and(|value| !value.is_null())) {
        return Err("登录未成功，请检查登录信息或到 Warframe Market 官网确认账户状态".into());
    }
    Ok(())
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
fn request(action: String, key: String, platform: String, token: String, body: Value) -> Result<Value, String> {
    request_scoped(action, key, platform, token, body, None)
}
fn request_scoped(
    action: String,
    key: String,
    platform: String,
    _token: String,
    body: Value,
    expected: Option<(String, String)>,
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
    if let Some((account, expected_platform)) = expected.as_ref() {
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
    if !auth {
        if let Some((at, v)) = g.cache.get(&ck) {
            if at.elapsed() < Duration::from_secs(if action == "items" { 3600 } else { 60 }) {
                return Ok(v.clone());
            }
        }
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
        g.writes.insert(fingerprint, Instant::now());
    }
    pace(&mut g, action == "rivens");
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
        .map_err(|_| "市场连接失败或超时；写操作未自动重试，请先刷新挂单")?;
    let unauthorized = r.status().as_u16() == 401;
    if unauthorized && auth {
        invalidate_presence();
    g.session = None;
    }
    let result = response(r)?;
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
    expected_account: String, expected_platform: String,
) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || request_scoped(action, key, platform, String::new(), body, Some((expected_account, expected_platform))))
        .await.map_err(|_| "市场任务失败".to_string())?
}
#[cfg(test)]
mod bulk_context_tests {
    use super::*;
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
