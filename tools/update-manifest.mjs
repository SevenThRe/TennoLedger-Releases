import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function manifest(version,url,signature,notes=''){
 if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Version must be major.minor.patch');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Installer URL must use HTTPS without credentials');
 const sig=signature.trim();
 if(!sig||!/^[-A-Za-z0-9+/=\s]+$/.test(sig))throw Error('Expected Tauri .sig file contents');
 return {version,notes,pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{url:parsed.href,signature:sig}}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [version,url,sigPath,output,notesPath]=process.argv.slice(2);
 if(!output)throw Error('Usage: node tools/update-manifest.mjs VERSION HTTPS_INSTALLER_URL SIG_PATH OUTPUT [NOTES_PATH]');
 const value=manifest(version,url,await readFile(sigPath,'utf8'),notesPath?await readFile(notesPath,'utf8'):'');
 await writeFile(output,JSON.stringify(value,null,2)+'\n');
}
