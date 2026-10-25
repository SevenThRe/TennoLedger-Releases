"""Export the software source allowlist into a new directory, excluding local history."""
import argparse, json, shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
DIRS={'desktop/src':{'.ts','.tsx','.css','.json'},'desktop/tests':{'.ts'},'desktop/src-tauri/src':{'.rs'},
      'desktop/src-tauri/capabilities':{'.json'},'collector':{'.py','.ps1'},
      'services/stats-share':{'.mjs','.js','.css','.html','.json'},'tools/notifications':{'.ps1'}}
FILES=['README.md','LICENSE','desktop/package.json','desktop/package-lock.json','desktop/index.html',
       'desktop/tsconfig.json','desktop/vite.config.ts','desktop/src-tauri/Cargo.toml','desktop/src-tauri/Cargo.lock',
       'desktop/src-tauri/build.rs','desktop/src-tauri/tauri.conf.json','desktop/src-tauri/notification-host/Program.cs',
       'desktop/src-tauri/helper-bin/SOURCE.json','desktop/public/tenno-ledger.svg','desktop/public/mod-card-placeholder.svg',
       'collector/fixtures/riven-capture-synthetic-event.json','collector/fixtures/riven-capture-synthetic.json',
       'collector/requirements.txt','collector/requirements-build.txt','tools/build-update.ps1','tools/publish-update.ps1','tools/verify-update.ps1',
       'tools/update-manifest.mjs','tools/with-msvc.ps1','tools/fetch_helper.ps1','tools/prepare-build.ps1',
       'tools/export_source.py','tools/build_resources.py','tools/prepare_resources.py','tools/build-resources.json',
       'tools/set-version.mjs','tools/test_updater_e2e.py']
IGNORE='''node_modules/
.venv/
__pycache__/
*.pyc
builds/
build-staging/
desktop/dist/
desktop/src-tauri/target/
desktop/src-tauri/gen/
desktop/src-tauri/icons/
desktop/src-tauri/collector-bin/
desktop/src-tauri/helper-bin/*.exe
desktop/src-tauri/helper-bin/LICENSE.txt
desktop/src-tauri/notification-host/*.dll
desktop/src-tauri/notification-host/*.exe
desktop/src-tauri/notification-host/*.md
desktop/tests/fixtures/
desktop/public/*
!desktop/public/tenno-ledger.svg
!desktop/public/mod-card-placeholder.svg
*.key
*.sig
*.sqlite3*
.env*
'''

def selected():
    paths={ROOT/name for name in FILES}
    for name,suffixes in DIRS.items():
        paths.update(path for path in (ROOT/name).rglob('*') if path.is_file() and path.suffix.lower() in suffixes and not any(part in {'node_modules','__pycache__','target','fixtures'} for part in path.parts))
    # Local notification observation scripts are not build dependencies.
    paths={path for path in paths if path.relative_to(ROOT).as_posix() not in {'tools/notifications/compare.ps1','tools/notifications/diagnose.ps1'}}
    return sorted(paths)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('destination',type=Path);args=parser.parse_args()
    dest=args.destination.resolve()
    if dest.exists(): raise SystemExit('Source export destination must be new; existing files are never deleted')
    paths=selected()
    for path in paths:
        if not path.is_file(): raise SystemExit('Required source missing: '+str(path.relative_to(ROOT)))
        if b'\0' in path.read_bytes(): raise SystemExit('Binary content rejected: '+str(path.relative_to(ROOT)))
    dest.mkdir(parents=True)
    for path in paths:
        target=dest/path.relative_to(ROOT);target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,target)
    (dest/'.gitignore').write_text(IGNORE,encoding='utf-8')
    (dest/'.gitattributes').write_text('* text=auto\n*.sh text eol=lf\n*.ps1 text eol=crlf\n',encoding='utf-8')
    print(json.dumps({'destination':str(dest),'sourceFiles':len(paths)+2,'readmeLines':len((dest/'README.md').read_text(encoding='utf-8').splitlines())}))

if __name__=='__main__': main()
