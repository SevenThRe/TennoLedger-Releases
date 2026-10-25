import test from 'node:test';
import assert from 'node:assert/strict';
import {sidebarQuotes,quoteLocale,quotePlatform} from '../src/sidebarQuotesModel.ts';
test('sidebar preserves actual non-English locale and platform while filtering exact rank and presence',()=>{
 const quote=(id:string,locale:string,platform:string,rank=0,status='ingame')=>({id,type:'buy',quantity:55,platinum:10,rank,user:{ingameName:id,locale,platform,status}});
 const rows=sidebarQuotes([quote('中文','zh-hans','pc'),quote('PS玩家','en','ps4'),quote('错误等级','en','pc',10),quote('离线','en','pc',0,'offline')],{rank:0});
 assert.deepEqual(rows.map(row=>row.id),['中文','PS玩家']);
 assert.equal(quoteLocale(rows[0].user.locale),'ZH-S');assert.equal(quotePlatform(rows[1].user.platform),'PS');assert.equal(quoteLocale(null),'—');
});
