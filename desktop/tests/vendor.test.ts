import assert from 'node:assert/strict';
import test from 'node:test';
import {vendorId,vendorGroup} from '../src/vendorCatalogModel.ts';
test('removes only the outer store prefix, preserving glyph identifiers',()=>{assert.equal(vendorId('/Lotus/StoreItems/Types/StoreItems/AvatarImages/ImageBaroKiteer'),'/Lotus/Types/StoreItems/AvatarImages/ImageBaroKiteer');});
test('groups Baro skins separately from weapons and mods',()=>{assert.equal(vendorGroup(undefined,'/Lotus/Upgrades/Skins/Necramech/EvilBaroNecramechSkin'),'cosmetics');assert.equal(vendorGroup({id:'x',name:'x',zh:'',image:'',category:'melee'},'x'),'weapons');assert.equal(vendorGroup({id:'x',name:'x',zh:'',image:'',category:'mod'},'x'),'mods');});
