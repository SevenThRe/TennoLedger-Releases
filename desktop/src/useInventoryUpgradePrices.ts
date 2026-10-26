import {useCallback,useEffect,useMemo,useState} from 'react';
import {native} from './api';
import {loadUpgradeBook,rankQuotes} from './upgradeQuotes';
import {upgradeInstances,type UpgradeRanks} from './upgradeInventoryModel';
export const inventoryUpgradeQuoteKey=(id:string,rank:number)=>JSON.stringify([id,rank]);
type Item={id:string;category:string;mod?:{fusionLimit?:number};arcane?:{maximumRank:number}};
export function useInventoryUpgradePrices(items:Item[],snapshot:{complete:boolean;counts:Record<string,number>;upgradeCountsByRank?:UpgradeRanks}|null,slugs:Readonly<Record<string,string>>,platform:string,loadAll:boolean){
 const [prices,setPrices]=useState<Record<string,number|null>>({}),[progress,setProgress]=useState('');
 const receive=useCallback((id:string,rank:number,price:number|null)=>{const key=inventoryUpgradeQuoteKey(id,rank);setPrices(old=>old[key]===price?old:{...old,[key]:price});},[]);
 useEffect(()=>{setPrices({});},[platform]);
 const candidates=useMemo(()=>items.filter(item=>slugs[item.id]).map(item=>({item,slug:slugs[item.id],ranks:upgradeInstances(item,snapshot?.upgradeCountsByRank,snapshot?.counts[item.id]??(snapshot?.complete?0:null)).map(row=>row.rank).filter((rank):rank is number=>rank!==null)})),[items,snapshot,slugs]);
 const key=JSON.stringify(candidates.map(row=>[row.item.id,row.slug,row.ranks]));
 useEffect(()=>{if(!native||!loadAll||!candidates.length){setProgress('');return;}let live=true,index=0,done=0;setProgress('0/'+candidates.length);
  const worker=async()=>{while(live&&index<candidates.length){const row=candidates[index++];try{const book=await loadUpgradeBook(row.slug,platform);if(live)for(const rank of row.ranks)receive(row.item.id,rank,rankQuotes(book.orders,rank).sell);}catch{if(live)for(const rank of row.ranks)receive(row.item.id,rank,null);}if(live)setProgress(++done===candidates.length?'':done+'/'+candidates.length);}};
  void Promise.all(Array.from({length:Math.min(4,candidates.length)},worker));return()=>{live=false;};
 },[key,platform,loadAll,receive]);
 return {prices,receive,progress};
}
