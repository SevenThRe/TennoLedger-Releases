import {test} from 'node:test';
import assert from 'node:assert/strict';
import {marketWriteDefinitelyRejected} from '../src/marketActions.ts';
test('explicit server refusal keeps orders editable, while ambiguous outcomes remain guarded',()=>{
 for(const status of [400,401,403,404,405,409,410,413,415,422,429])assert(marketWriteDefinitelyRejected(`市场 HTTP ${status}：rejected`));
 assert(marketWriteDefinitelyRejected('市场业务拒绝：app.errors.forbidden'));
 assert(marketWriteDefinitelyRejected(new Error('市场 HTTP 403：app.errors.forbidden')));
 for(const value of ['市场 HTTP 500：失败','市场 HTTP 408：超时','市场连接失败或超时','未收到订单回执，请先核对“我的订单”','市场账号已切换，请重新操作'])assert(!marketWriteDefinitelyRejected(value));
});
