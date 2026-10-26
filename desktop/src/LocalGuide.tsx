import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import './localGuide.css';

export type GuideTopic='guide'|'faq'|'data';
export default function LocalGuide({topic,en,onClose,onNavigate,onDiagnostics}:{topic:GuideTopic;en:boolean;onClose:()=>void;onNavigate:(page:string)=>void;onDiagnostics:()=>void}){
 const L=(zh:string,english:string)=>en?english:zh,root=useRef<HTMLElement>(null);
 useEffect(()=>{const before=document.activeElement as HTMLElement|null;root.current?.querySelector<HTMLButtonElement>('button')?.focus();return()=>{if(before?.isConnected)before.focus();};},[]);
 const title=topic==='guide'?L('TennoLedger 使用指南','TennoLedger user guide'):topic==='faq'?L('TennoLedger 常见问题','TennoLedger FAQ'):L('TennoLedger 数据接入指南','TennoLedger data guide');
 const go=(page:string)=>{onClose();onNavigate(page);};
 return createPortal(<div className="localGuideShade" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><section ref={root} className="localGuide" role="dialog" aria-modal="true" aria-labelledby="localGuideTitle" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}if(event.key==='Tab'){const nodes=[...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),summary')],first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
 <header><h2 id="localGuideTitle">{title}</h2><button aria-label={L('关闭指南','Close guide')} onClick={onClose}>×</button></header>
 <div className="localGuideBody">
 {topic==='guide'?<>
 <section><h3>{L('开始使用','Get started')}</h3><p>{L('在同一台电脑上启动 TennoLedger 和 Warframe。登录游戏后，在左上角账户面板执行同步；先确认账户和数据更新时间，再查看库存。','Start TennoLedger and Warframe on the same PC. Sign in to the game and sync from the account panel in the top left. Check the account and data timestamp before reviewing inventory.')}</p><button onClick={onDiagnostics}>{L('检查游戏数据连接','Check game data connection')}</button></section>
 <section><h3>{L('库存与制造','Inventory and crafting')}</h3><p>{L('库存可按物品类型、名称与拥有状态筛选。铸造厂用于查看制造树；资源中的制造助手会汇总收藏目标的材料需求。报价、库存或配方尚未读取时，数值会显示为未知。','Filter inventory by item type, name, and ownership. Use Foundry to inspect crafting trees and Resources → Crafting helper to review ingredients for favorites. Unavailable prices, counts, or recipes stay unknown.')}</p><div><button onClick={()=>go('inventory')}>{L('打开库存','Open inventory')}</button><button onClick={()=>go('resources')}>{L('打开资源','Open resources')}</button></div></section>
 <section><h3>{L('遗物与市场','Relics and market')}</h3><p>{L('遗物规划用于比较奖励和精炼等级，也可将筛选应用到遗物推荐浮层。warframe.market 账户独立连接，查询行情与管理个人订单是不同操作。','Use Relic planner to compare rewards and refinements and apply filters to the recommendation overlay. Connect warframe.market separately; viewing prices and managing personal orders are separate actions.')}</p><div><button onClick={()=>go('relics')}>{L('打开遗物规划','Open Relic planner')}</button><button onClick={()=>go('settings')}>{L('打开设置','Open Settings')}</button></div></section>
 </>:topic==='faq'?<>
 <details open><summary>{L('为什么显示“使用旧数据”或没有库存？','Why is inventory missing or marked as old?')}</summary><p>{L('应用可能正在显示上一次保存的快照。确认游戏已登录、账户面板选中了当前账户，并执行重新同步。连接诊断可查看采集组件、自动同步与快照状态。','The app may be showing a previously saved snapshot. Sign in to the game, verify the current account in the account panel, and retry sync. Connection diagnostics show collector, automatic sync, and snapshot status.')}</p><button onClick={onDiagnostics}>{L('打开连接诊断','Open connection diagnostics')}</button></details>
 <details><summary>{L('“—”代表数量为零吗？','Does “—” mean zero?')}</summary><p>{L('不代表。它表示数据尚未读取、无法核实，或当前没有可用报价。已确认的零数量会显示为 0。','No. It means data is unavailable, unverified, or has no usable quote. A confirmed zero is displayed as 0.')}</p></details>
 <details><summary>{L('需要付费或购买会员吗？','Is a subscription required?')}</summary><p>{L('TennoLedger 自身功能免费。市场个人订单仍需要连接你自己的 warframe.market 账户，游戏数据仍需要完成本机采集。','TennoLedger features are free. Personal market orders still require your own warframe.market account, and game data requires local collection.')}</p></details>
 <details><summary>{L('为什么是中文或英文？','How is the language selected?')}</summary><p>{L('默认语言跟随 Warframe 启动器：中文使用中文，其余语言使用英文。也可在设置中手动选择。','The default follows the Warframe launcher: Chinese uses Chinese; other languages use English. You can also choose a language in Settings.')}</p></details>
 </>:<>
 <section><h3>{L('游戏数据','Game data')}</h3><ol><li>{L('在本机运行 Warframe，并完成登录。','Run Warframe locally and sign in.')}</li><li>{L('在 TennoLedger 设置中启用自动同步。','Enable automatic sync in TennoLedger Settings.')}</li><li>{L('从左上角账户面板重新同步，核对账户和采集时间。','Retry sync from the top-left account panel and check the account and capture time.')}</li><li>{L('仍未更新时打开连接诊断，查看失败项；必要时导出诊断摘要。','If data is still stale, open connection diagnostics, check failed items, and export a diagnostic summary if needed.')}</li></ol><button onClick={onDiagnostics}>{L('打开连接诊断','Open connection diagnostics')}</button></section>
 <section><h3>{L('市场与记录','Market and history')}</h3><p>{L('游戏账户与 warframe.market 账户分别连接。市场价格需要联网；个人订单需要市场登录。历史统计从实际采集和记录的数据开始，不会自动补出未记录的历史。','Game and warframe.market accounts connect separately. Market prices require network access; personal orders require market sign-in. Historical statistics start with data actually collected and recorded, and do not reconstruct missing history.')}</p></section>
 </>}
 </div><footer><span>{L('TennoLedger 内置指南 · 可离线阅读','TennoLedger built-in guide · available offline')}</span><button onClick={onClose}>{L('关闭','Close')}</button></footer>
 </section></div>,document.body);
}
