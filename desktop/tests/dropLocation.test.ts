import {missionZh} from '../src/worldModel.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {dropLocationTranslator,type LocationData} from '../src/dropLocation.ts';
const data:LocationData={planets:{Void:'虚空',Earth:'地球'},nodes:{one:{name:'Mot',zh:'死灵塔',planet:'Void',planetZh:'虚空'}}};
test('drop labels use exact node/planet and preserve rotation and unknown mission detail',()=>{
 const tr=dropLocationTranslator(data,false,missionZh);
 assert.equal(tr('Void/Mot (Survival), Rotation C'),'虚空/死灵塔 (生存), 轮次 C');
 assert.equal(tr('Earth/Mot (Mobile Defense), Rotation A'),'地球/Mot (移动防御), 轮次 A');
 assert.equal(tr('Earth/Cetus (Level 15 - 25 Plague Star), Rotation B'),'地球/Cetus (Level 15 - 25 Plague Star), 轮次 B');
 assert.equal(tr('Unknown reward'),'Unknown reward');
});
test('English and ambiguous node labels are preserved',()=>{
 const source='Void/Mot (Survival), Rotation C';
 assert.equal(dropLocationTranslator(data,true)(source),source);
 const conflict={...data,nodes:{...data.nodes,two:{...data.nodes.one,zh:'Other'}}};
 assert.equal(dropLocationTranslator(conflict,false,missionZh)(source),'虚空/Mot (生存), 轮次 C');
});
