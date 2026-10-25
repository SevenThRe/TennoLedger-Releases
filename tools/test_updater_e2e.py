"""Windows acceptance: fresh NSIS install -> real signed updater -> data-preserving restart.

Build the old-version fixture with cargo build --bin myframe-desktop
--features diagnostics,tauri/custom-protocol (after npm run build).
Uses a dedicated acceptance profile; signing credentials are never needed here.
"""
import argparse, hashlib, http.server, json, os, shutil, sqlite3, subprocess, threading, time, uuid
from pathlib import Path

def sha(path):
    with Path(path).open('rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()

def wait_for(predicate,seconds,message):
    end=time.monotonic()+seconds
    while time.monotonic()<end:
        try:
            if predicate(): return
        except (OSError,sqlite3.Error): pass
        time.sleep(.3)
    raise RuntimeError(message)

def marker(db):
    if not db.exists():return None
    with sqlite3.connect(db.as_uri()+'?mode=ro',uri=True) as connection:
        row=connection.execute("SELECT value FROM settings WHERE key='release_acceptance_marker'").fetchone()
        return row[0] if row else None

def main():
    parser=argparse.ArgumentParser()
    for name in ['manifest','fixture-exe','production-exe','result']:parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--install-dir',type=Path,default=Path(os.environ['LOCALAPPDATA'])/'TennoLedger')
    args=parser.parse_args();args.install_dir=args.install_dir.resolve()
    manifest=json.loads(args.manifest.read_text(encoding='utf-8-sig'))
    installer=args.manifest.parent/Path(manifest['platforms']['windows-x86_64']['url']).name
    installed=args.install_dir/'myframe-desktop.exe';expected=sha(args.production_exe)
    if sha(args.fixture_exe)==expected:raise RuntimeError('Fixture must differ from release binary')
    profile=Path(os.environ['APPDATA'])/'org.myframe.acceptance.updater-e2e'
    if profile.exists():raise RuntimeError('Preserve prior acceptance profile; archive it before rerunning')
    if installed.exists():raise RuntimeError('Fresh-install acceptance requires an empty target directory')
    requests=[]
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append({'path':self.path,'at':time.time()});print('Updater request: '+self.path,flush=True)
            if self.path=='/latest.json':
                value=json.loads(json.dumps(manifest));value['platforms']['windows-x86_64']['url']=f'http://127.0.0.1:{server.server_port}/installer.exe'
                data=json.dumps(value).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
            elif self.path=='/installer.exe':
                self.send_response(200);self.send_header('Content-Type','application/octet-stream');self.send_header('Content-Length',str(installer.stat().st_size));self.end_headers()
                with installer.open('rb') as incoming:shutil.copyfileobj(incoming,self.wfile)
            else:self.send_error(404)
        def log_message(self,*_):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    started=None;success=False
    result={'version':manifest['version'],'profile':profile.name,'installDir':str(args.install_dir),'realMarketWrites':'NOT_RUN'}
    try:
        subprocess.run([str(installer),'/S',f'/D={args.install_dir}'],check=True,timeout=300)
        wait_for(lambda:installed.is_file() and sha(installed)==expected,90,'Fresh installer did not deploy release binary')
        result['freshInstall']='PASS';print('Fresh install: PASS',flush=True)
        profile.mkdir(parents=True);database=profile/'myframe.sqlite3';token='update-e2e-'+uuid.uuid4().hex
        with sqlite3.connect(database) as db:
            db.execute('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)')
            db.execute('INSERT INTO settings VALUES(?,?)',('release_acceptance_marker',token))
        shutil.copy2(args.fixture_exe,installed)
        env=os.environ.copy();env['TENNOLEDGER_UPDATE_E2E_ENDPOINT']=f'http://127.0.0.1:{server.server_port}/latest.json';env['TENNOLEDGER_UPDATE_E2E_INSTALL_DIR']=str(args.install_dir)
        log=args.result.with_suffix('.fixture.log');log.parent.mkdir(parents=True,exist_ok=True)
        with log.open('wb') as output:
            started=subprocess.Popen([str(installed),'--acceptance-profile','updater-e2e'],env=env,stdout=output,stderr=subprocess.STDOUT,cwd=args.install_dir)
            print('Old-version fixture started: '+str(started.pid),flush=True)
            started.wait(timeout=300)
        if started.returncode!=0:raise RuntimeError('Old-version fixture exited unsuccessfully')
        wait_for(lambda:installed.exists() and sha(installed)==expected,180,'Updater did not replace its running old binary')
        wait_for(lambda:list((profile/'update-backups').glob('before-0.0.9-*.sqlite3')),30,'Real update_prepare backup missing')
        backups=list((profile/'update-backups').glob('before-0.0.9-*.sqlite3'))
        if marker(database)!=token or not any(marker(path)==token for path in backups):raise RuntimeError('Acceptance data was not preserved in both current DB and pre-update backup')
        command="Get-CimInstance Win32_Process | Where-Object {$_.Name -eq 'myframe-desktop.exe'} | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress"
        def restarted():
            raw=subprocess.check_output(['pwsh','-NoProfile','-Command',command],text=True,encoding='utf-8').strip()
            if not raw:return False
            rows=json.loads(raw);rows=rows if isinstance(rows,list) else [rows]
            return any(row.get('ExecutablePath','').lower()==str(installed).lower() and '--acceptance-profile' in (row.get('CommandLine') or '') for row in rows)
        wait_for(restarted,60,'Installed production version did not restart with the isolated acceptance profile')
        if not any(row['path']=='/latest.json' for row in requests) or not any(row['path']=='/installer.exe' for row in requests):raise RuntimeError('Real updater requests were not observed')
        result.update({'oldVersion':'0.0.9','automaticUpgrade':'PASS','signatureVerifiedBy':'tauri-plugin-updater download','databasePreserved':'PASS','preUpdateBackup':'PASS','restart':'PASS','productionExeSha256':expected,'requests':requests});success=True
    finally:
        server.shutdown();server.server_close()
        if not success:
            if started is not None and started.poll() is None:started.terminate();started.wait(timeout=15)
            # Recover the newly installed release after a failed fixture. No original user data is modified.
            try:shutil.copy2(args.production_exe,installed)
            except OSError:pass
            result['status']='FAILED'
        else:result['status']='PASS'
        args.result.parent.mkdir(parents=True,exist_ok=True);args.result.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(result))

if __name__=='__main__':main()
