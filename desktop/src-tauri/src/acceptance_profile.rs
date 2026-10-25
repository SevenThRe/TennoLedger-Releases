pub fn parse(args:&[String])->Result<Option<String>,String>{
    let positions:Vec<_>=args.iter().enumerate().filter(|(_,a)|a.as_str()=="--acceptance-profile").map(|(i,_)|i).collect();
    if positions.is_empty(){return Ok(None);}
    if positions.len()!=1{return Err("acceptance profile specified more than once".into());}
    let name=args.get(positions[0]+1).ok_or("acceptance profile requires a name")?;
    if name.is_empty()||name.len()>40||!name.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'){
        return Err("acceptance profile must be 1-40 ASCII letters, digits or hyphens".into());
    }
    Ok(Some(format!("org.myframe.acceptance.{}",name.to_ascii_lowercase())))
}
#[cfg(test)]mod tests{
 use super::*;
 fn args(v:&[&str])->Vec<String>{v.iter().map(|s|s.to_string()).collect()}
 #[test]fn normal_launch_is_unchanged(){assert_eq!(parse(&args(&["app.exe"])).unwrap(),None);}
 #[test]fn profile_is_separate_and_canonical(){assert_eq!(parse(&args(&["app.exe","--acceptance-profile","R6-Visual"])).unwrap(),Some("org.myframe.acceptance.r6-visual".into()));}
 #[test]fn rejects_paths_missing_names_and_duplicates(){for input in [vec!["--acceptance-profile"],vec!["--acceptance-profile","../desktop"],vec!["--acceptance-profile","x","--acceptance-profile","y"],vec!["--acceptance-profile",""]]{assert!(parse(&args(&input)).is_err());}}
}
