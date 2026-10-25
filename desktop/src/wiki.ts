export function wikiUrl(provider:'english'|'huiji',name:string,zh=''){
 if(provider==='huiji'&&name.trim()==='Akimbo Slip Shot')return 'https://warframe.huijiwiki.com/wiki/'+encodeURIComponent('双枪滑射');
 const query=(provider==='huiji'?zh.trim()||name.trim():name.trim());
 const base=provider==='huiji'?'https://warframe.huijiwiki.com/wiki/Special:Search':'https://wiki.warframe.com/w/Special:Search';
 return `${base}?search=${encodeURIComponent(query)}`;
}
