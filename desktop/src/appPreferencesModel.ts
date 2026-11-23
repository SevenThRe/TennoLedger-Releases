export type CloseAction='ask'|'minimize'|'close';
export type AppPreferences={warnOnClose:boolean;closeAction:CloseAction;launchOnSecondary:boolean;recordStats:boolean;statsTabEnabled:boolean;rememberMarketStatus:boolean;fullInventoryExperienceEnabled:boolean;takeRankIntoAccount:boolean};
export const appPreferencesKey='myframe.appPreferences.v1';
export const appPreferenceDefaults:AppPreferences={warnOnClose:true,closeAction:'ask',launchOnSecondary:false,recordStats:true,statsTabEnabled:true,rememberMarketStatus:false,fullInventoryExperienceEnabled:false,takeRankIntoAccount:true};
const booleanPreferenceKeys:(keyof Omit<AppPreferences,'closeAction'>)[]=['warnOnClose','launchOnSecondary','recordStats','statsTabEnabled','rememberMarketStatus','fullInventoryExperienceEnabled','takeRankIntoAccount'];
const validCloseActions:readonly CloseAction[]=['ask','minimize','close'];
export function parseAppPreferences(value:unknown):AppPreferences{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid preferences');
 const p=value as Record<string,unknown>,next={...appPreferenceDefaults};
 for(const key of booleanPreferenceKeys){
  if(p[key]!==undefined){
   if(typeof p[key]!=='boolean')throw Error('Invalid preference: '+key);
   next[key]=p[key] as boolean;
  }
 }
 if(p.closeAction!==undefined){
  if(typeof p.closeAction!=='string'||!validCloseActions.includes(p.closeAction as CloseAction))throw Error('Invalid preference: closeAction');
  next.closeAction=p.closeAction as CloseAction;
  next.warnOnClose=next.closeAction==='ask';
 }else if(p.warnOnClose!==undefined){
  next.closeAction=next.warnOnClose?'ask':'close';
 }
 return next;
}
export function readAppPreferences(raw:string|null){try{return parseAppPreferences(JSON.parse(raw??'{}'));}catch{return {...appPreferenceDefaults};}}
export function resolveWindowCloseDecision(action:CloseAction,alreadyMinimized:boolean):CloseAction{
 if(action==='close')return 'close';
 if(action==='minimize')return alreadyMinimized?'close':'minimize';
 return 'ask';
}
