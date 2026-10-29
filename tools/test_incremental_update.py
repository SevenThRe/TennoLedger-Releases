"""Exercise the real Windows updater in isolated directories, with tiny compiled apps."""
import argparse,ctypes,hashlib,json,os,subprocess,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent

def digest(path):
    with path.open('rb')as f:return hashlib.file_digest(f,'sha256').hexdigest()

def compile_cs(source,output):
    compiler=Path(os.environ['WINDIR'])/'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    subprocess.run([str(compiler),'/nologo','/nowarn:0649','/target:winexe','/reference:System.Web.Extensions.dll','/out:'+str(output),str(source)],check=True,capture_output=True)

def fixture(folder,kind):
    path=folder/(kind+'.exe');source=folder/(kind+'.cs')
    source.write_text('''using System;using System.IO;class App {static int Main(){var root=AppDomain.CurrentDomain.BaseDirectory;File.WriteAllText(Path.Combine(root,"running.marker"),"KIND");CRASH var token=Environment.GetEnvironmentVariable("TENNOLEDGER_UPDATE_ACK");if(!String.IsNullOrEmpty(token))File.WriteAllText(Path.Combine(root,".tennoledger-update",token,"ready"),"ready");return 0;}}'''.replace('KIND',kind).replace('CRASH','return 13;' if kind=='crash' else ''),encoding='utf-8')
    compile_cs(source,path);return path

def case(base,name,old,new,runner,fail=None):
    root=base/name;root.mkdir();(root/'helper').mkdir();(root/'account.sqlite3').write_bytes(b'preserved account');dest=root/'myframe-desktop.exe';dest.write_bytes(old.read_bytes())
    stable=root/'helper/stable.dll';stable.write_bytes(b'unchanged');stamp=stable.stat().st_mtime_ns
    locked=root/'helper/locked.dll';locked.write_bytes(b'old dependency')
    obsolete=root/'helper/obsolete.dll';obsolete.write_bytes(b'old removed file')
    token='testcase-12345678';stage=root/'.tennoledger-update'/token;stage.mkdir(parents=True)
    entries=[]
    for rel,data in [('myframe-desktop.exe',new.read_bytes()),('helper/locked.dll',b'new dependency')]:
        incoming=stage/'files'/rel;incoming.parent.mkdir(parents=True,exist_ok=True);incoming.write_bytes(data)
        entries.append(dict(path=rel,sha256=digest(incoming),size=len(data),before=digest(root/rel)))
    plan=dict(parent=2147483000,root=str(root),token=token,version='0.1.6',files=entries,remove=[dict(path='helper/obsolete.dll',before=digest(obsolete))])
    (stage/'plan.json').write_text(json.dumps(plan),encoding='utf-8');(stage/'state').write_text('prepared')
    handle=None
    if fail=='tamper':(stage/'files/myframe-desktop.exe').write_bytes(b'tampered')
    if fail=='locked':
        kernel=ctypes.WinDLL('kernel32',use_last_error=True);kernel.CreateFileW.restype=ctypes.c_void_p
        handle=kernel.CreateFileW(str(locked),0x80000000,0,None,3,0,None)
        assert handle not in (None,ctypes.c_void_p(-1).value)
    if fail=='interrupted':
        backup=stage/'backup/myframe-desktop.exe';backup.parent.mkdir(parents=True);backup.write_bytes(dest.read_bytes());dest.write_bytes(new.read_bytes())
        (stage/'backup/helper').mkdir();(stage/'backup/helper/locked.dll').write_bytes(locked.read_bytes());locked.write_bytes(b'new dependency')
        obsolete.replace(stage/'backup/helper/obsolete.dll');(stage/'state').write_text('applying')
    try:
        args=[str(runner),str(stage)]+(['--recover']if fail=='interrupted' else [])
        result=subprocess.run(args,timeout=80)
    finally:
        if handle:
            kernel.CloseHandle.argtypes=[ctypes.c_void_p];kernel.CloseHandle(handle)
    expected='committed' if fail is None and new.stem!='crash' else 'rolled-back'
    state=(stage/'state').read_text();assert state==expected,(name,state,(stage/'error.txt').read_text()if(stage/'error.txt').exists()else '')
    assert digest(dest)==digest(new if expected=='committed' else old),name
    assert (root/'account.sqlite3').read_bytes()==b'preserved account'
    assert stable.read_bytes()==b'unchanged' and stable.stat().st_mtime_ns==stamp
    assert locked.read_bytes()==(b'new dependency' if expected=='committed' else b'old dependency')
    assert (not obsolete.exists()) if expected=='committed' else obsolete.read_bytes()==b'old removed file'
    return dict(case=name,state=state,unchangedDependencyPreserved=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    base=Path(tempfile.mkdtemp(prefix='acceptance-',dir=a.output)).resolve()
    runner=base/'Update.exe';compile_cs(ROOT/'desktop/src-tauri/update-host/Program.cs',runner)
    old=fixture(base,'old');new=fixture(base,'new');crash=fixture(base,'crash')
    rows=[case(base,'success',old,new,runner),case(base,'tampered-download',old,new,runner,'tamper'),case(base,'locked-dependency',old,new,runner,'locked'),case(base,'startup-failed',old,crash,runner),case(base,'interrupted-recovery',old,new,runner,'interrupted')]
    (a.output/'installer-acceptance.json').write_text(json.dumps(rows,indent=2),encoding='utf-8');print(json.dumps(rows))
if __name__=='__main__':main()
