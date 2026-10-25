import test from 'node:test';
import assert from 'node:assert/strict';
import {isRewardFavorite} from '../src/relicFavorites.ts';
test('reward favorite follows its own ID or its actual recipe parent',()=>{
 assert.equal(isRewardFavorite(['blade'],'blade',[]),true);
 assert.equal(isRewardFavorite(['gunsen'],'blade',[{id:'gunsen'}]),true);
 assert.equal(isRewardFavorite(['gunsen'],'other-blade',[{id:'other'}]),false);
 assert.equal(isRewardFavorite(['gunsen'],'blade',[]),false);
 assert.equal(isRewardFavorite([],'blade',[{id:'gunsen'}]),false);
});
