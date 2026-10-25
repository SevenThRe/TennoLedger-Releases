import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkSources} from '../src/artworkModel.ts';
test('mod art always selects the full card and never the illustration in the user screenshot',()=>{
 const item={id:'serration',category:'mod',image:'/reference/artwork/fire.png',imageUrl:'https://cdn.alecaframe.com/warframeData/img/RifleDamageAmountMod.jpg',mod:{cardImage:'/reference/artwork/serration-card.png',wikiaThumbnail:'https://wiki.warframe.com/images/SerrationMod.png'}};
 assert.deepEqual(artworkSources(item),[item.mod.cardImage,item.mod.wikiaThumbnail,'/mod-card-placeholder.svg']);
 assert(!artworkSources(item).includes(item.image));
});
test('missing mod card metadata uses an honest card placeholder while ordinary images retain their order',()=>{
 assert.deepEqual(artworkSources({id:'missing',category:'mod',image:'illustration.jpg'}),['/mod-card-placeholder.svg']);
 assert.deepEqual(artworkSources({id:'item',image:'local.png',imageUrl:'remote.png'}),['local.png','remote.png','/reference/ui/question.png']);
});
