"""Prepare versioned runtime/build dependencies as a Release asset, never Git content."""
import argparse, hashlib, json, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ROOTS = ['desktop/public', 'desktop/tests/fixtures', 'desktop/src-tauri/icons']
EXTRA = ['desktop/src-tauri/notification-host/Microsoft.Toolkit.Uwp.Notifications.dll',
         'desktop/src-tauri/notification-host/TOOLKIT-LICENSE.md', 'desktop/src-tauri/helper-bin/LICENSE.txt']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--version', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--repo', default='SevenThRe/TennoLedger-Releases')
    args = parser.parse_args()
    if args.output.exists(): raise SystemExit('Preserve existing resource archive; choose a fresh output')
    paths = {p for name in ROOTS for p in (ROOT / name).rglob('*') if p.is_file()}
    paths.update(ROOT / name for name in EXTRA)
    paths.difference_update(ROOT/name for name in ['desktop/public/tenno-ledger.svg','desktop/public/mod-card-placeholder.svg'])
    if any(not p.is_file() for p in paths): raise SystemExit('Required build resource missing')
    # Only software data/images/fonts and the pinned notification dependency belong here.
    forbidden = {'.sqlite3', '.db', '.key', '.pdb', '.exe', '.log', '.har', '.pcap', '.xml'}
    if any(p.suffix.lower() in forbidden or p.suffix.lower() not in {'.png','.webp','.json','.svg','.woff2','.jpg','.txt','.gif','.ico','.dll','.md'} for p in paths): raise SystemExit('Unexpected private/generated resource type')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(args.output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(paths): archive.write(path, path.relative_to(ROOT).as_posix())
    with args.output.open('rb') as stream: digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    manifest = {'version': args.version,
                'url': f'https://github.com/{args.repo}/releases/download/v{args.version}/TennoLedger_{args.version}_build-resources.zip',
                'sha256': digest, 'files': len(paths), 'bytes': args.output.stat().st_size}
    (ROOT / 'tools/build-resources.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print(json.dumps(manifest))

if __name__ == '__main__': main()
