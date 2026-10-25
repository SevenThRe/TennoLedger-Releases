//! Read the launcher's UI/text language, never its voice language or the OS locale.
use std::io::{Read, Seek, SeekFrom};

fn normalize(code: &str) -> Option<String> {
    let code = code.trim().trim_start_matches('_').to_ascii_lowercase();
    (!code.is_empty() && code.len() <= 24 && code.chars().all(|c| c.is_ascii_alphabetic() || c == '-'))
        .then_some(code)
}

fn log_language(log: &str) -> Option<String> {
    // The final launch wins. `-languageVO:` deliberately does not match.
    let marker = "-language:";
    let offset = log.rfind(marker)? + marker.len();
    let token = log[offset..].split(|c: char| c.is_whitespace() || c == '"').next()?;
    normalize(token)
}

#[cfg(windows)]
fn registry_language() -> Option<String> {
    use windows::core::w;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, RRF_RT_REG_SZ};
    let mut buffer = [0u16; 64];
    let mut bytes = std::mem::size_of_val(&buffer) as u32;
    let status = unsafe { RegGetValueW(
        HKEY_CURRENT_USER, w!("Software\\Digital Extremes\\Warframe\\Launcher"),
        w!("Language"), RRF_RT_REG_SZ, None,
        Some(buffer.as_mut_ptr().cast()), Some(&mut bytes),
    ) };
    if status.0 != 0 { return None; }
    let length = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    normalize(&String::from_utf16_lossy(&buffer[..length]))
}

#[cfg(not(windows))]
fn registry_language() -> Option<String> { None }

fn launcher_log_language() -> Option<String> {
    let path = std::path::PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join("Warframe/Launcher.log");
    let mut file = std::fs::File::open(path).ok()?;
    // Read only a bounded tail; no account/log content is returned or persisted.
    let length = file.metadata().ok()?.len();
    file.seek(SeekFrom::Start(length.saturating_sub(1024 * 1024))).ok()?;
    let mut bytes = Vec::new();
    file.take(1024 * 1024).read_to_end(&mut bytes).ok()?;
    log_language(&String::from_utf8_lossy(&bytes))
}

#[tauri::command]
pub fn warframe_launcher_language() -> &'static str {
    let language = registry_language().or_else(launcher_log_language);
    ui_language(language.as_deref())
}

fn ui_language(language: Option<&str>) -> &'static str {
    match language {
        Some("zh" | "zh-cn" | "zh-tw" | "zh-hans" | "zh-hant" | "tc" | "sc") => "zh-CN",
        _ => "en",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn selects_latest_text_language_and_ignores_voice() {
        assert_eq!(log_language("-language:en -languageVO:zh\n-language:zh -languageVO:en"), Some("zh".into()));
        assert_eq!(log_language("-language:de -languageVO:zh"), Some("de".into()));
        assert_eq!(log_language("-languageVO:zh"), None);
    }
    #[test]
    fn handles_truncated_or_invalid_logs() {
        assert_eq!(log_language("-language:"), None);
        assert_eq!(log_language("-language:zh-CN\""), Some("zh-cn".into()));
        assert_eq!(log_language("-language:../zh"), None);
        assert_eq!(normalize("_ZH"), Some("zh".into()));
    }
    #[test]
    fn chinese_text_languages_map_to_chinese_and_all_others_to_english() {
        for code in ["zh", "zh-cn", "zh-tw", "zh-hans", "zh-hant", "tc", "sc"] {
            assert_eq!(ui_language(Some(code)), "zh-CN");
        }
        for code in [None, Some("en"), Some("de"), Some("ja"), Some("")] {
            assert_eq!(ui_language(code), "en");
        }
    }
}
