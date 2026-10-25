import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),version=process.argv[2];
if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version??''))throw Error('Usage: node tools/set-version.mjs MAJOR.MINOR.PATCH');
for(const file of ['desktop/package.json','desktop/package-lock.json','desktop/src-tauri/tauri.conf.json']){
 const target=path.join(root,file),value=JSON.parse(await readFile(target,'utf8'));value.version=version;
 if(file.endsWith('package-lock.json'))value.packages[''].version=version;
 await writeFile(target,JSON.stringify(value,null,2)+'\n');
}
for(const file of ['desktop/src-tauri/Cargo.toml','desktop/src-tauri/Cargo.lock']){
 const target=path.join(root,file),text=await readFile(target,'utf8');
 const pattern=file.endsWith('Cargo.toml')?/(\[package\]\s*name\s*=\s*"myframe-desktop"\s*version\s*=\s*")[^"]+("?)/:/(\[\[package\]\]\s*name\s*=\s*"myframe-desktop"\s*version\s*=\s*")[^"]+("?)/;
 if(!pattern.test(text))throw Error('Desktop version entry missing: '+file);
 await writeFile(target,text.replace(pattern,(_,prefix,suffix)=>prefix+version+suffix));
}
console.log('Desktop source versions set to '+version);
