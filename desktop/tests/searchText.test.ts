import test from 'node:test';import assert from 'node:assert/strict';
import {searchText} from '../src/searchText.ts';
test('Chinese, English, full pinyin, initials and mixed syllables share one search',()=>{
 for(const q of ['旋风','xf','xuanfeng','xuanf','XF','ｘｆ','xuánfēng','xf prime','旋风 PRIME'])assert.equal(searchText(q,'旋风 Prime','Whirlwind Prime'),true,q);
 assert.equal(searchText('xf zzz','旋风 Prime','Whirlwind Prime'),false);
 assert.equal(searchText('zzz | xf','旋风'),true);assert.equal(searchText('zzz |','旋风'),false);
});
test('polyphones, umlaut and punctuation are supported without unrelated gaps',()=>{
 assert.equal(searchText('zhongzhuang','重装'),true);assert.equal(searchText('chongzhuang','重装'),true);
 assert.equal(searchText('lv','绿陶'),true);assert.equal(searchText('lü','绿陶'),true);
 assert.equal(searchText('xttj','信条·铁晶磁轨炮'),true);assert.equal(searchText('xj','信条·铁晶磁轨炮'),false);
 assert.equal(searchText('','anything'),true);assert.equal(searchText('solaris','索拉里斯联盟','Solaris United'),true);
});
