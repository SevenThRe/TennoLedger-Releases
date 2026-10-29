"""Build a signed-manifest-ready range archive from the actual installed file set."""
import argparse,gzip,hashlib,json,shutil,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent

def build(exe,output,version):
    if any((output/n).exists() for n in ('incremental.json','incremental.bin')):raise ValueError('Preserve existing incremental candidate')
    files=[('myframe-desktop.exe',exe)]
    for folder,prefix in [('desktop/src-tauri/collector-bin/myframe-collector','collector'),('desktop/src-tauri/helper-bin','helper')]:
        root=ROOT/folder
        if not root.is_dir():raise ValueError('Missing bundled dependency '+folder)
        files.extend((prefix+'/'+p.relative_to(root).as_posix(),p) for p in sorted(root.rglob('*')) if p.is_file())
    entries=[];seen={};output.mkdir(parents=True,exist_ok=True)
    with (output/'incremental.bin').open('xb') as archive:
        for rel,path in files:
            if path.is_symlink() or path.suffix.lower() in {'.key','.db','.sqlite3','.dpapi','.log'}:raise ValueError('Unexpected dependency file '+rel)
            with path.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
            if digest not in seen:
                offset=archive.tell()
                with gzip.GzipFile(fileobj=archive,mode='wb',filename='',mtime=0,compresslevel=6) as packed:
                    with path.open('rb') as incoming:shutil.copyfileobj(incoming,packed)
                seen[digest]=(offset,archive.tell()-offset)
            offset,length=seen[digest]
            entries.append(dict(path=rel,sha256=digest,size=path.stat().st_size,compressed_size=length,offset=offset))
        size=archive.tell()
    manifest=dict(schema=1,version=version,archive_size=size,files=entries)
    (output/'incremental.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    return manifest

def verify(folder):
    manifest=json.loads((folder/'incremental.json').read_text(encoding='utf-8'))
    if (folder/'incremental.bin').stat().st_size!=manifest['archive_size']:raise ValueError('Archive length mismatch')
    with (folder/'incremental.bin').open('rb') as archive:
        for entry in manifest['files']:
            archive.seek(entry['offset']);packed=archive.read(entry['compressed_size'])
            with tempfile.TemporaryFile() as expanded:
                with gzip.GzipFile(fileobj=__import__('io').BytesIO(packed)) as incoming:shutil.copyfileobj(incoming,expanded)
                if expanded.tell()!=entry['size']:raise ValueError('Expanded size mismatch')
                expanded.seek(0)
                if hashlib.file_digest(expanded,'sha256').hexdigest()!=entry['sha256']:raise ValueError('Expanded hash mismatch')
    return manifest

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--exe',type=Path);p.add_argument('--output',type=Path,required=True);p.add_argument('--version');p.add_argument('--verify',action='store_true');a=p.parse_args()
    m=verify(a.output) if a.verify else build(a.exe,a.output,a.version)
    print(json.dumps(dict(version=m['version'],files=len(m['files']),archiveBytes=m['archive_size'])))
