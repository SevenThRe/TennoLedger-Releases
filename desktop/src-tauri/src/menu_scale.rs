//! Menu scale affects reward-name geometry, independently of desktop/overlay zoom.
use serde::{Deserialize, Serialize};
use std::{io::Read, path::PathBuf};
use tauri::Manager;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all="camelCase",default,deny_unknown_fields)]
pub struct MenuScale { pub mode:String, pub percent:u16 }
impl Default for MenuScale { fn default()->Self{Self{mode:"full".into(),percent:100}} }
fn valid(value:&MenuScale)->bool{matches!(value.mode.as_str(),"full"|"legacy"|"custom")&&(25..=400).contains(&value.percent)}
pub fn path(app:&tauri::AppHandle)->Result<PathBuf,String>{Ok(app.path().app_data_dir().map_err(|e|e.to_string())?.join("menu-scale.json"))}
fn load(app:&tauri::AppHandle)->Result<MenuScale,String>{let path=path(app)?;if !path.is_file(){return Ok(Default::default());}let data=std::fs::read(path).map_err(|e|e.to_string())?;if data.len()>4096{return Err("Invalid menu scale file".into());}let value:MenuScale=serde_json::from_slice(&data).map_err(|e|e.to_string())?;if !valid(&value){return Err("Invalid menu scale".into());}Ok(value)}
#[tauri::command]
pub fn warframe_menu_scale(app:tauri::AppHandle)->Result<MenuScale,String>{load(&app)}
#[tauri::command]
pub fn warframe_set_menu_scale(app:tauri::AppHandle,preferences:MenuScale)->Result<MenuScale,String>{
 if !valid(&preferences){return Err("Invalid menu scale".into());}
 let path=path(&app)?;std::fs::create_dir_all(path.parent().ok_or("Missing app directory")?).map_err(|e|e.to_string())?;
 let temp=path.with_extension("json.tmp");std::fs::write(&temp,serde_json::to_vec(&preferences).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
 std::fs::rename(&temp,&path).map_err(|e|e.to_string())?;Ok(preferences)
}
fn parse_config(text:&str)->Result<MenuScale,String>{
 let field=|key:&str|text.lines().filter_map(|line|line.trim().split_once('=')).filter(|(k,_)|k.trim()==key).map(|(_,v)|v.trim()).last();
 let mode=match field("Flash.FlashDrawScaleMode"){Some("MSM_CUSTOM")=>"custom",Some("MSM_MATCH_SCREEN")=>"legacy",Some("MSM_FULL")|Some("MSM_MATCH_SCREEN_HEIGHT")|None=>"full",Some(_)=>return Err("Unknown Warframe Menu Scale mode".into())};
 let percent=if mode=="custom" {let scale=field("Flash.FlashDrawScale").ok_or("Missing custom Menu Scale")?.parse::<f64>().map_err(|_|"Invalid custom Menu Scale")?;if !scale.is_finite()||!(0.25..=4.).contains(&scale){return Err("Invalid custom Menu Scale".into());}(scale*100.).round() as u16}else{100};
 Ok(MenuScale{mode:mode.into(),percent})
}
#[tauri::command]
pub fn warframe_detect_menu_scale(app:tauri::AppHandle)->Result<MenuScale,String>{
 let file=PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA unavailable")?).join("Warframe/EE.cfg");
 let mut bytes=Vec::new();std::fs::File::open(file).map_err(|_|"Warframe EE.cfg unavailable")?.take(2*1024*1024+1).read_to_end(&mut bytes).map_err(|e|e.to_string())?;
 if bytes.len()>2*1024*1024{return Err("Warframe settings file too large".into());}
 let text=if bytes.starts_with(&[255,254]){String::from_utf16_lossy(&bytes[2..].chunks_exact(2).map(|b|u16::from_le_bytes([b[0],b[1]])).collect::<Vec<_>>())}else{String::from_utf8_lossy(&bytes).into_owned()};
 let value=parse_config(&text)?;warframe_set_menu_scale(app,value)
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn game_settings_keep_modes_and_fractional_custom_scale(){assert_eq!(parse_config("Flash.FlashDrawScaleMode=MSM_CUSTOM\nFlash.FlashDrawScale=0.85").unwrap(),MenuScale{mode:"custom".into(),percent:85});assert_eq!(parse_config("Flash.FlashDrawScaleMode=MSM_MATCH_SCREEN").unwrap().mode,"legacy");assert_eq!(parse_config("unrelated=value").unwrap(),MenuScale::default());}
 #[test]fn invalid_scales_never_silently_report_detection_success(){for value in ["NaN","-1","0","999","oops"]{assert!(parse_config(&format!("Flash.FlashDrawScaleMode=MSM_CUSTOM\nFlash.FlashDrawScale={value}")).is_err());}assert!(parse_config("Flash.FlashDrawScaleMode=MSM_CUSTOM").is_err());assert!(parse_config("Flash.FlashDrawScaleMode=UNKNOWN").is_err());}
}
