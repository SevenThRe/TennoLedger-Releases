import test from 'node:test';
import assert from 'node:assert/strict';
import {
    marketAuthViewMode,
    marketDialogError,
    shouldCloseAuthDialogAfterAction,
} from '../src/marketAccountModel.ts';

test('marketAuthViewMode prefers saved-session recovery over password login when remembered offline', () => {
    assert.equal(
        marketAuthViewMode({ connected: false, remembered: true, restoring: false }, true, false),
        'recovery',
    );
    assert.equal(
        marketAuthViewMode({ connected: false, remembered: true, restoring: false }, true, true),
        'credentials',
    );
    assert.equal(
        marketAuthViewMode({ connected: false, remembered: false, restoring: false }, true, false),
        'credentials',
    );
    assert.equal(
        marketAuthViewMode({ connected: false, remembered: true, restoring: true }, true, false),
        'credentials',
    );
    assert.equal(
        marketAuthViewMode({ connected: true, remembered: true, restoring: false }, true, false),
        'credentials',
    );
    assert.equal(
        marketAuthViewMode({ connected: false, remembered: true, restoring: false }, false, false),
        'credentials',
    );
});

test('marketDialogError prefers explicit action error and falls back to sessionError', () => {
    assert.equal(marketDialogError('登录验证失败', '暂时无法恢复 WM 登录'), '登录验证失败');
    assert.equal(marketDialogError('  ', '保存的 WM 登录已过期，请重新登录'), '保存的 WM 登录已过期，请重新登录');
    assert.equal(marketDialogError('', null), '');
});

test('shouldCloseAuthDialogAfterAction never dismisses dialog on failed retry restore', () => {
    assert.equal(shouldCloseAuthDialogAfterAction('refresh', false), false);
    assert.equal(shouldCloseAuthDialogAfterAction('refresh', true), true);
    assert.equal(shouldCloseAuthDialogAfterAction('login', false), false);
    assert.equal(shouldCloseAuthDialogAfterAction('login', true), true);
    assert.equal(shouldCloseAuthDialogAfterAction('logout', true), false);
    assert.equal(shouldCloseAuthDialogAfterAction('logout', false), false);
});
