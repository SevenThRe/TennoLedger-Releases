export type MarketSessionState = {
    connected: boolean;
    remembered?: boolean;
    restoring?: boolean;
    sessionError?: string | null;
};

export type MarketAuthViewMode = 'recovery' | 'credentials';

export function marketAuthViewMode(
    session: MarketSessionState,
    isNative: boolean,
    forceCredentials: boolean,
): MarketAuthViewMode {
    if (isNative && !session.connected && !session.restoring && session.remembered === true && !forceCredentials) {
        return 'recovery';
    }
    return 'credentials';
}

export function marketDialogError(actionError: string, sessionError?: string | null): string {
    return actionError.trim() || sessionError?.trim() || '';
}

export function shouldCloseAuthDialogAfterAction(
    mode: 'login' | 'logout' | 'refresh',
    connected: boolean,
): boolean {
    if (mode === 'logout') {
        return false;
    }
    return connected;
}
