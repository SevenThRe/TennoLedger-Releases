"""Download and verify build resources; keep dependency binaries out of Git."""
import argparse, hashlib, json, os, shutil, stat, tempfile, urllib.request, zipfile
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
PREFIXES = ('desktop/public/', 'desktop/tests/fixtures/', 'desktop/src-tauri/icons/')
EXTRA = {'desktop/src-tauri/notification-host/Microsoft.Toolkit.Uwp.Notifications.dll',
         'desktop/src-tauri/notification-host/TOOLKIT-LICENSE.md', 'desktop/src-tauri/helper-bin/LICENSE.txt'}

def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()

def prepare(archive, expected):
    if digest(archive) != expected: raise ValueError('Build resources SHA256 mismatch')
    with zipfile.ZipFile(archive) as source:
        rows=source.infolist()
        if len(rows)>20000 or sum(row.file_size for row in rows)>2*1024**3: raise ValueError('Archive exceeds build resource limits')
        seen=set()
        for row in rows:
            name=row.filename
            path=PurePosixPath(name)
            if '\\' in name or path.is_absolute() or '..' in path.parts or ':' in name or name.casefold() in seen: raise ValueError('Unsafe resource entry')
            if not name.startswith(PREFIXES) and name not in EXTRA: raise ValueError('Unexpected resource destination: '+name)
            if stat.S_ISLNK(row.external_attr >> 16): raise ValueError('Resource symlinks are not allowed')
            seen.add(name.casefold())
        if source.testzip() is not None: raise ValueError('Resource ZIP CRC mismatch')
        for row in rows:
            target=ROOT.joinpath(*PurePosixPath(row.filename).parts)
            if not target.resolve().is_relative_to(ROOT): raise ValueError('Resource escaped project')
            target.parent.mkdir(parents=True,exist_ok=True)
            with source.open(row) as incoming, tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as output:
                temporary=Path(output.name);shutil.copyfileobj(incoming,output)
            os.replace(temporary,target)
    return len(rows)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--archive',type=Path);args=parser.parse_args()
    info=json.loads((ROOT/'tools/build-resources.json').read_text(encoding='utf-8'))
    cache=ROOT/'builds/dependencies'/f'resources-{info["sha256"]}.zip'
    archive=args.archive
    if archive is None:
        cache.parent.mkdir(parents=True,exist_ok=True)
        if not cache.exists() or digest(cache)!=info['sha256']:
            temporary=cache.with_suffix('.download')
            try:
                request=urllib.request.Request(info['url'],headers={'User-Agent':'TennoLedger-build'})
                with urllib.request.urlopen(request,timeout=120) as response, temporary.open('wb') as output: shutil.copyfileobj(response,output)
                if digest(temporary)!=info['sha256']: raise ValueError('Downloaded resource checksum mismatch')
                os.replace(temporary,cache)
            finally: temporary.unlink(missing_ok=True)
        archive=cache
    count=prepare(archive,info['sha256']);print(f'Verified and prepared {count} build resources')

if __name__=='__main__': main()
