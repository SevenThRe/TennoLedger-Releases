import {analyticsPieData,analyticsPieRadius} from './analyticsPie';
import {useEffect,useRef} from 'react';
import * as echarts from 'echarts';
export default function MarketCategoryPie({rows,zh}:{rows:{type:string;value:number}[];zh:boolean}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!ref.current)return;const chart=echarts.init(ref.current);const labels:Record<string,string>=zh?{riven:'未揭示紫卡',prime:'Prime 部件',set:'套装',arcane:'赋能',mod:'模组',relic:'遗物',other:'其他'}:{riven:'Riven (Veiled)',prime:'Prime part',set:'Set',arcane:'Arcane',mod:'Mod',relic:'Relic',other:'Other'};
 chart.setOption({tooltip:{trigger:'item',confine:true},series:[{type:'pie',radius:analyticsPieRadius,label:{show:false},stillShowZeroSum:false,data:analyticsPieData(rows.map(row=>({...row,name:labels[row.type]??row.type})))}]});const observer=new ResizeObserver(()=>chart.resize());observer.observe(ref.current);return()=>{observer.disconnect();chart.dispose();};},[rows,zh]);
 return <div className="tradeStatementPie" ref={ref} role="img" aria-label={zh?'全市场类别占比':'Whole market category proportions'}/>;
}
