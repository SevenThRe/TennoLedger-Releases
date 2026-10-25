import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesRelicReward} from '../src/relicModel.ts';
test('reward highlights match Chinese or English words but never an empty query',()=>{
 const reward={name:'Gunsen Prime Blade'};
 assert.equal(matchesRelicReward(reward,'军扇 刀刃','军扇 Prime 刀刃'),true);
 assert.equal(matchesRelicReward(reward,' GUNSEN prime '),true);
 assert.equal(matchesRelicReward(reward,'Lith G10','军扇 Prime 刀刃'),false);
 assert.equal(matchesRelicReward(reward,'   '),false);
 assert.equal(matchesRelicReward(reward,'Gunsen Receiver'),false);
});
