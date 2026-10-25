//! Shell AppUserModel.ID is a VT_LPWSTR property, not an automation BSTR.
use windows::Win32::System::{
    Com::StructuredStorage::{PropVariantChangeType, PROPVARIANT, PVCHF_DEFAULT},
    Variant::VT_LPWSTR,
};

pub fn shell_string(value: &str) -> windows::core::Result<PROPVARIANT> {
    let source = PROPVARIANT::from(value);
    let mut result = PROPVARIANT::default();
    unsafe { PropVariantChangeType(&mut result, &source, PVCHF_DEFAULT, VT_LPWSTR)? };
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn app_id_uses_shell_string_type() {
        let value = shell_string("org.myframe.desktop").unwrap();
        unsafe {
            assert_eq!(value.Anonymous.Anonymous.vt, VT_LPWSTR);
            assert_eq!(value.Anonymous.Anonymous.Anonymous.pwszVal.to_string().unwrap(), "org.myframe.desktop");
        }
    }
}
