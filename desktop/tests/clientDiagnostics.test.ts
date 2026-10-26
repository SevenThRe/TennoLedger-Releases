import {test} from 'node:test';import assert from 'node:assert/strict';
import {diagnosticFault} from '../src/clientDiagnosticsModel.ts';
test('frontend reporting only forwards fixed classifications, never arbitrary exception content',()=>{
 const secret='private-jwt-password@example.com';
 for(const value of [secret,new Error(secret),{message:secret},null,undefined])assert.equal(diagnosticFault(value),'other');
 assert.equal(diagnosticFault(new TypeError(secret)),'type_error');assert.equal(diagnosticFault(new ReferenceError(secret)),'reference_error');
 assert.equal(diagnosticFault(new SyntaxError(secret)),'syntax_error');assert.equal(diagnosticFault('Failed to fetch '+secret),'network_error');
});
