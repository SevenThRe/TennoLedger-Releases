use crate::price_engine::PriceEngine;
use serde_json::Value;
use std::sync::Arc;
#[tauri::command]
pub async fn market_analytics(state: tauri::State<'_, Arc<PriceEngine>>) -> Result<Value, String> {
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || service.snapshot())
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn market_price_quote(
    slug: String,
    platform: String,
    state: tauri::State<'_, Arc<PriceEngine>>,
) -> Result<Value, String> {
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || service.quote(&slug, &platform))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn market_price_warm(
    slugs: Vec<String>,
    platform: String,
    state: tauri::State<'_, Arc<PriceEngine>>,
) -> Result<(), String> {
    if slugs.len() > 1000 {
        return Err("Too many price targets".into());
    }
    let service = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        for slug in slugs {
            service.request(&slug, &platform)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
