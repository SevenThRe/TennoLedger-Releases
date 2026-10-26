import {test} from 'node:test';
import assert from 'node:assert/strict';
import {presenceErrorText} from '../src/marketPresenceModel.ts';
test('presence errors distinguish upstream challenge, TLS, proxy and timeout in both languages',()=>{
 const error='市场状态服务返回 Cloudflare 验证（HTTP 403）；请检查系统代理，稍后重连';
 assert.equal(presenceErrorText(error,false),error);
 assert.match(presenceErrorText(error,true),/Cloudflare.*403/);
 assert.match(presenceErrorText('市场状态 TLS 证书验证或加密协商失败',true),/certificate/);
 assert.match(presenceErrorText('系统代理拒绝状态隧道（HTTP 502）',true),/proxy.*502/);
 assert.match(presenceErrorText('状态连接超时',true),/timed out/);
});
