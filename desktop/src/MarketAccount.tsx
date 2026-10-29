import {marketLoginEvent} from './marketLoginNavigation';
import {createPortal} from 'react-dom';
import {visibleBounds} from './viewportBounds';
import MarketPresence from './MarketPresence';
import {MarketActionGate} from './marketActions';
import {rivenInventoryRefresh as latestRefresh} from './rivenInventoryRefresh';
import {useState,useEffect,useRef} from 'react';
import {useTranslation} from 'react-i18next';
import MarketIcon from './MarketIcon';
import {invoke} from '@tauri-apps/api/core';
import {native} from './api';
import './marketAccount.css';
export type MarketSession={accountId?:string|null;sessionGeneration?:number;connected:boolean;ingameName?:string|null;verified?:boolean|null;verificationReason?:string;platform?:string;remembered?:boolean;restoring?:boolean;sessionError?:string|null;};
const disconnected:MarketSession={connected:false};
export function useMarketSession(){
 const [session,setSession]=useState<MarketSession>({...disconnected,restoring:native});
 useEffect(()=>{
  const reader=latestRefresh(()=>invoke<MarketSession>('market_session'),setSession,()=>{},error=>{if(error)setSession(previous=>({...previous,restoring:false,sessionError:error}));});
  const refresh=()=>{if(native)void reader.refresh();};
  refresh();const retry=window.setInterval(refresh,30000);window.addEventListener('market-session-changed',refresh);
  return()=>{window.clearInterval(retry);reader.dispose();window.removeEventListener('market-session-changed',refresh);};
 },[]);
 return session;
}
export const sessionChanged=()=>window.dispatchEvent(new Event('market-session-changed'));
export default function MarketAccount({platform:marketPlatform,initiallyOpen=true}:{platform?:string;initiallyOpen?:boolean}={}){
 const {i18n}=useTranslation(),en=i18n.language.startsWith('en'),L=(zh:string,eng:string)=>en?eng:zh;
 const dialogRef=useRef<HTMLElement>(null),session=useMarketSession(),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[platform,setPlatform]=useState('pc'),[open,setOpen]=useState(initiallyOpen),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const authGate=useRef(new MarketActionGate()),[remember,setRemember]=useState(true);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener(marketLoginEvent,show);return()=>window.removeEventListener(marketLoginEvent,show);},[]);
 useEffect(()=>{if(session.connected){setPassword('');setOpen(false);}},[session.connected]);
 async function auth(mode:'login'|'logout'|'refresh'){
  await authGate.current.run(async()=>{
  setBusy(true);setError('');
  try{
   if(!native)throw Error('请在桌面程序中登录');
   if(mode==='login')await invoke('market_login',{email:email.trim(),password,platform:marketPlatform??platform,remember});
   else if(mode==='refresh')await invoke('market_refresh_session');
   else await invoke('market_logout');
   sessionChanged();setOpen(mode==='logout');
  }catch(e){setError(String(e));}
  finally{if(mode==='logout')sessionChanged();setPassword('');setBusy(false);}
  });
 }
 const [authBounds,setAuthBounds]=useState({left:0,top:48,width:innerWidth,height:innerHeight-48});
 useEffect(()=>{if(!open)return;const before=document.activeElement as HTMLElement|null;const place=()=>{const root=document.querySelector('.marketBoard')??document.querySelector('.app>main');if(root)setAuthBounds(visibleBounds(root.getBoundingClientRect(),{width:innerWidth,height:innerHeight},document.querySelector('.windowContent')?.getBoundingClientRect()));};place();window.addEventListener('resize',place);document.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);document.removeEventListener('scroll',place,true);before?.focus();};},[open]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Tab'){const nodes=[...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],summary')??[])].filter(node=>node.getClientRects().length>0);if(nodes.length){const index=nodes.indexOf(document.activeElement as HTMLElement);if(e.shiftKey&&index<=0){e.preventDefault();nodes[nodes.length-1].focus();}else if(!e.shiftKey&&(index===nodes.length-1||index===-1)){e.preventDefault();nodes[0].focus();}}}if(e.key==='Escape'&&!busy){setPassword('');setOpen(false);}};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[open,busy]);
 return <div className="marketAccount" onClick={event=>{const link=event.target instanceof Element?event.target.closest<HTMLAnchorElement>('a[href]'):null;if(native&&link){event.preventDefault();void invoke('open_market_account_link',{url:link.href}).catch(e=>setError(String(e)));}}}>
  {session.connected?<div className="marketAccountIdentity"><span>{session.ingameName??L('已登录','Signed in')}</span><button disabled={busy} onClick={()=>void auth('refresh')}>{L('刷新账户状态','Refresh account')}</button><button disabled={busy} onClick={()=>void auth('logout')}>{busy?L('处理中…','Working…'):L('退出登录','Log out')}</button></div>:session.restoring?<span role="status">{L('正在恢复 WM 登录…','Restoring WM session…')}</span>:<button className="marketLoginTrigger" onClick={()=>setOpen(true)}>{L('登录 warframe.market','Sign in to warframe.market')}</button>}
  {!session.connected&&!session.restoring&&open&&createPortal(<div className="marketAuthShade" style={authBounds}><section ref={dialogRef} role="dialog" aria-modal="true" aria-label={L('登录 warframe.market','Sign in to warframe.market')} className="marketAuthDialog">
   <button type="button" className="marketAuthClose" aria-label={L('关闭登录','Close sign in')} disabled={busy} onClick={()=>{setPassword('');setOpen(false);}}><MarketIcon name="close"/></button>
   <div className="marketAccountBrand"/><h2>{L('登录 warframe.market','Sign in to warframe.market')}</h2>
   {native?<form onSubmit={e=>{e.preventDefault();void auth('login');}}>
    {marketPlatform===undefined&&<label>{L('平台','Platform')}<select value={platform} disabled={busy} onChange={e=>setPlatform(e.target.value)}>{['pc','ps4','xbox','switch'].map(x=><option key={x}>{x}</option>)}</select></label>}
    <label>{L('电子邮箱','Email')}<input type="email" autoComplete="username" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)} required autoFocus/></label>
    <label>{L('密码','Password')}<input type="password" autoComplete="off" value={password} disabled={busy} onChange={e=>setPassword(e.target.value)} required/></label>
    <label className="marketRemember" title={L('使用 Windows 用户加密保存会话，不保存密码','Store the session with Windows user encryption; never store your password')}><input type="checkbox" checked={remember} disabled={busy} onChange={e=>setRemember(e.target.checked)}/>{L('记住登录','Remember me')}</label>
    {error&&<p className="marketLoginError" role="alert">{error}</p>}
    <button className="marketLoginSubmit" type="submit" disabled={busy}>{busy?L('登录中…','Signing in…'):L('登录','Log in')}</button>
   </form>:<div className="marketPreviewLogin"><p>{L('请在桌面应用中登录 warframe.market','Sign in to warframe.market in the desktop app.')}</p><a href="https://warframe.market/auth/signin" target="_blank" rel="noreferrer">{L('打开 warframe.market','Open warframe.market')}<MarketIcon name="link"/></a></div>}
   <div className="marketAccountLinks"><span>{L('初次使用 warframe.market？','New to warframe.market?')}</span><a href="https://warframe.market/auth/registration" target="_blank" rel="noreferrer">{L('创建账户','Create an account')}<MarketIcon name="link"/></a></div>
   <details className="marketSteamHelp"><summary>{L('通常使用 Steam 登录？','Usually sign in with Steam?')}</summary><div className="marketSteamHelpBody"><p>{L('在 warframe.market 账户设置中添加邮箱与密码，然后在此使用','Add an email and password in your warframe.market account settings, then use them here')}</p><a href="https://warframe.market/settings/account" target="_blank" rel="noreferrer">{L('warframe.market 账户设置','warframe.market account settings')}<MarketIcon name="link"/></a></div></details>
  </section></div>,document.body)}
  {session.connected&&<MarketPresence session={session}/>}
  {session.connected&&session.verified!==true&&<small>{session.verificationReason??L('请先在 Warframe Market 完成游戏账号验证。','Verify your game account on warframe.market first.')}</small>}
  {session.connected&&error&&<p className="marketLoginError" role="alert">{error}</p>}
  {session.sessionError&&<p className="marketLoginError" role="status">{session.sessionError}</p>}
 </div>;
}
