export const followWarframeLanguage='auto';
export function languagePreference(saved:string|null,available:readonly {id:string}[]):string {
 return saved&&available.some(p=>p.id===saved)?saved:followWarframeLanguage;
}
export function launcherUiLanguage(value:unknown):'zh-CN'|'en' {
 return typeof value==='string'&&['zh','zh-cn','zh-tw','zh-hans','zh-hant','tc','sc'].includes(value.trim().toLowerCase())?'zh-CN':'en';
}
