#[cfg(windows)]
pub fn choose(owner:usize,name:&str)->Result<Option<std::path::PathBuf>,String>{
    use std::{ffi::{c_void,OsString},os::windows::ffi::OsStringExt};
    #[repr(C)] struct OpenFileName{size:u32,owner:*mut c_void,instance:*mut c_void,filter:*const u16,custom_filter:*mut u16,max_custom:u32,filter_index:u32,file:*mut u16,max_file:u32,file_title:*mut u16,max_title:u32,initial_dir:*const u16,title:*const u16,flags:u32,file_offset:u16,extension_offset:u16,default_ext:*const u16,custom_data:isize,hook:*mut c_void,template:*const u16,reserved:*mut c_void,reserved_word:u32,flags_ex:u32}
    #[link(name="comdlg32")] extern "system"{fn GetSaveFileNameW(info:*mut OpenFileName)->i32;fn CommDlgExtendedError()->u32;}
    let (filter_text,default_extension)=file_format(name);
    let filter:Vec<u16>=filter_text.encode_utf16().collect();let title:Vec<u16>="导出数据 / Export data\0".encode_utf16().collect();let ext:Vec<u16>=default_extension.encode_utf16().collect();let mut file=vec![0u16;32768];for (i,c) in name.encode_utf16().take(255).enumerate(){file[i]=c;}
    unsafe {let mut info:OpenFileName=std::mem::zeroed();info.size=std::mem::size_of::<OpenFileName>() as u32;info.owner=owner as *mut c_void;info.filter=filter.as_ptr();info.filter_index=1;info.file=file.as_mut_ptr();info.max_file=file.len() as u32;info.title=title.as_ptr();info.default_ext=ext.as_ptr();info.flags=0x80000|0x800|0x8|0x2;
        if GetSaveFileNameW(&mut info)==0 {return if CommDlgExtendedError()==0{Ok(None)}else{Err("无法打开保存对话框".into())};}}
    let len=file.iter().position(|c|*c==0).unwrap_or(file.len());Ok(Some(OsString::from_wide(&file[..len]).into()))
}
#[cfg(not(windows))]pub fn choose(_:usize,_:&str)->Result<Option<std::path::PathBuf>,String>{Err("此平台不支持保存对话框".into())}

#[cfg(any(windows,test))]
fn file_format(name:&str)->(&'static str,&'static str){
    if name.ends_with(".png"){return ("PNG (*.png)\0*.png\0\0","png\0");}
    if name.ends_with(".log"){return ("Log (*.log)\0*.log\0\0","log\0");}
    if name.ends_with(".txt"){return ("Text (*.txt)\0*.txt\0\0","txt\0");}
    if std::path::Path::new(name).extension().is_some_and(|ext|ext.eq_ignore_ascii_case("csv")) {
        ("CSV (*.csv)\0*.csv\0\0","csv\0")
    } else { ("JSON (*.json)\0*.json\0\0","json\0") }
}
#[cfg(test)]mod tests{
    #[test]fn csv_and_existing_json_dialog_formats(){
        assert_eq!(super::file_format("myframe-stats.csv"),("CSV (*.csv)\0*.csv\0\0","csv\0"));
        assert_eq!(super::file_format("TRADES.CSV").1,"csv\0");
        assert_eq!(super::file_format("myframe-backup.json"),("JSON (*.json)\0*.json\0\0","json\0"));
    }
}
