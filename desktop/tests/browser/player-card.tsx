import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/style.css';
import '../../src/strictParity.css';
import '../../src/windowShell.css';
import '../../src/navigation.css';
import '../../src/theme.css';
import '../../src/playerCard.css';

type ScenarioId = 'current' | 'cached' | 'unavailable' | 'paused' | 'missing-name';

interface CollectorStatusFixture {
  enabled: boolean;
  running: boolean;
  code: string;
  accountCode: string;
  inventorySource: string | null;
  scanCode: string;
  lastReadAt: string | null;
  scan: Record<string, unknown>;
  lastInventoryAt: string | null;
  observedItems: number;
  lastRelic: null;
}

interface SnapshotFixture {
  schemaVersion: number;
  capturedAt: string;
  source: string;
  complete: boolean;
  masteryRank: number | null;
  credits: number | null;
  counts: Record<string, number>;
  ranks: Record<string, number>;
  favorites: string[];
  playerProfile: {
    name?: string | null;
    platinum?: number | null;
    endo?: number | null;
    ducats?: number | null;
  } | null;
  masteryAccount?: Record<string, unknown> | null;
}

type CallbackFn = (payload: unknown) => void;
interface TauriInternals {
  transformCallback: (cb?: CallbackFn, once?: boolean) => number;
  unregisterCallback: (id: number) => void;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}
type MockWindow = Window & {
  isTauri?: boolean;
  __TAURI_INTERNALS__?: TauriInternals;
  __TAURI_EVENT_PLUGIN_INTERNALS__?: {
    unregisterListener: (event: string, eventId: number) => void;
  };
};

const SCENARIO_LABELS: ReadonlyArray<readonly [ScenarioId, string]> = [
  ['current', '已同步'],
  ['cached', '旧数据'],
  ['unavailable', '无数据'],
  ['paused', '已暂停'],
  ['missing-name', '缺昵称'],
];

const parseScenario = (): ScenarioId => {
  const param = new URLSearchParams(location.search).get('scenario');
  if (
    param === 'current' ||
    param === 'cached' ||
    param === 'unavailable' ||
    param === 'paused' ||
    param === 'missing-name'
  ) {
    return param;
  }
  return 'current';
};

const baseResponse = await fetch('/qa/mastery-snapshot.json');
if (!baseResponse.ok) {
  throw new Error('Failed to load /qa/mastery-snapshot.json');
}
const baseSnapshot = (await baseResponse.json()) as SnapshotFixture;

const buildSnapshot = (scenario: ScenarioId): SnapshotFixture | null => {
  if (scenario === 'unavailable') return null;
  const copy = structuredClone(baseSnapshot);
  copy.capturedAt = new Date().toISOString();
  if (scenario === 'missing-name' && copy.playerProfile) {
    copy.playerProfile.name = null;
  }
  return copy;
};

const buildStatus = (scenario: ScenarioId): CollectorStatusFixture => {
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  switch (scenario) {
    case 'current':
    case 'missing-name':
      return {
        enabled: true,
        running: true,
        code: 'running',
        accountCode: 'synced',
        inventorySource: 'warframe-api-helper',
        scanCode: 'helper-current',
        lastReadAt: nowIso,
        scan: { provider: 'warframe-api-helper', attemptInventoryComplete: true },
        lastInventoryAt: nowIso,
        observedItems: 361,
        lastRelic: null,
      };
    case 'cached':
      return {
        enabled: true,
        running: true,
        code: 'running',
        accountCode: 'cached',
        inventorySource: 'warframe-api-helper',
        scanCode: 'helper-network-failed',
        lastReadAt: staleIso,
        scan: { provider: 'warframe-api-helper' },
        lastInventoryAt: staleIso,
        observedItems: 361,
        lastRelic: null,
      };
    case 'unavailable':
      return {
        enabled: true,
        running: true,
        code: 'running',
        accountCode: 'waiting-data',
        inventorySource: null,
        scanCode: 'game-not-running',
        lastReadAt: null,
        scan: {},
        lastInventoryAt: null,
        observedItems: 0,
        lastRelic: null,
      };
    case 'paused':
      return {
        enabled: false,
        running: false,
        code: 'stopped',
        accountCode: 'waiting-data',
        inventorySource: null,
        scanCode: 'stopped',
        lastReadAt: null,
        scan: {},
        lastInventoryAt: null,
        observedItems: 0,
        lastRelic: null,
      };
  }
};

let activeScenario: ScenarioId = parseScenario();
let activeSnapshot: SnapshotFixture | null = buildSnapshot(activeScenario);
let activeStatus: CollectorStatusFixture = buildStatus(activeScenario);
let syncCalls = 0;
let enableCalls = 0;
let helpClicks = 0;
const onStateChangeListeners = new Set<() => void>();
const notifyHarness = () => {
  for (const fn of onStateChangeListeners) fn();
};

let nextCallbackId = 1;
let nextListenerId = 1;
const callbacks = new Map<number, { cb: CallbackFn; once: boolean }>();
const eventListeners = new Map<number, { event: string; handlerId: number }>();

const emitTauriEvent = (event: string, payload: unknown) => {
  for (const [id, rec] of eventListeners.entries()) {
    if (rec.event !== event) continue;
    const target = callbacks.get(rec.handlerId);
    if (!target) continue;
    target.cb({ event, id, payload });
    if (target.once) callbacks.delete(rec.handlerId);
  }
};

const mockWindow = window as unknown as MockWindow;
mockWindow.isTauri = true;
mockWindow.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: (_event: string, eventId: number) => {
    eventListeners.delete(eventId);
  },
};
mockWindow.__TAURI_INTERNALS__ = {
  transformCallback: (cb?: CallbackFn, once = false) => {
    const id = nextCallbackId++;
    if (cb) callbacks.set(id, { cb, once });
    return id;
  },
  unregisterCallback: (id: number) => {
    callbacks.delete(id);
  },
  invoke: async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'plugin:event|listen') {
      const id = nextListenerId++;
      eventListeners.set(id, {
        event: String(args?.event ?? ''),
        handlerId: Number(args?.handler ?? 0),
      });
      return id;
    }
    if (cmd === 'plugin:event|unlisten') {
      eventListeners.delete(Number(args?.eventId ?? 0));
      return null;
    }
    if (cmd === 'warframe_launcher_language') return 'zh';
    if (cmd === 'load_collection') return activeSnapshot ? structuredClone(activeSnapshot) : null;
    if (cmd === 'collector_status') return structuredClone(activeStatus);
    if (cmd === 'collector_set_enabled') {
      const enabled = Boolean(args?.enabled);
      enableCalls += 1;
      activeStatus = {
        ...activeStatus,
        enabled,
        running: enabled,
        code: enabled ? 'running' : 'stopped',
        scanCode: enabled ? 'waiting-data' : 'stopped',
      };
      emitTauriEvent('collector-updated', structuredClone(activeStatus));
      notifyHarness();
      return structuredClone(activeStatus);
    }
    if (cmd === 'collector_request_refresh') {
      syncCalls += 1;
      activeStatus = {
        ...activeStatus,
        enabled: true,
        running: true,
        code: 'running',
        scanCode: 'helper-fetching',
      };
      emitTauriEvent('collector-updated', structuredClone(activeStatus));
      notifyHarness();
      window.setTimeout(() => {
        const nowIso = new Date().toISOString();
        if (!activeSnapshot) {
          activeSnapshot = buildSnapshot('current');
        }
        activeStatus = {
          ...activeStatus,
          enabled: true,
          running: true,
          code: 'running',
          accountCode: 'synced',
          inventorySource: 'warframe-api-helper',
          scanCode: 'helper-current',
          lastReadAt: nowIso,
          lastInventoryAt: nowIso,
          observedItems: 361,
        };
        emitTauriEvent('collector-updated', structuredClone(activeStatus));
        emitTauriEvent('collection-updated', null);
        notifyHarness();
      }, 60);
      return true;
    }
    return null;
  },
};

const [{ i18nReady }, { default: PlayerCard }] = await Promise.all([
  import('../../src/i18n'),
  import('../../src/PlayerCard'),
]);
await i18nReady;

function Harness() {
  const [, setVersion] = useState(0);
  React.useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    onStateChangeListeners.add(refresh);
    return () => {
      onStateChangeListeners.delete(refresh);
    };
  }, []);

  const switchScenario = (next: ScenarioId) => {
    activeScenario = next;
    activeSnapshot = buildSnapshot(next);
    activeStatus = buildStatus(next);
    emitTauriEvent('collector-updated', structuredClone(activeStatus));
    emitTauriEvent('collection-updated', null);
    notifyHarness();
  };

  return (
    <div className="windowContent" style={{ position: 'relative', inset: 0, height: '100vh' }}>
      <div className="app">
        <aside className="navigationV3">
          <PlayerCard
            onHelp={() => {
              helpClicks += 1;
              notifyHarness();
            }}
          />
        </aside>
        <main style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>PlayerCard QA</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SCENARIO_LABELS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-scenario={id}
                aria-pressed={activeScenario === id}
                style={{
                  background: activeScenario === id ? 'var(--color-tab-active)' : undefined,
                  borderColor: activeScenario === id ? 'var(--color-tab-lighter)' : undefined,
                }}
                onClick={() => switchScenario(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <pre
            data-testid="qa-state"
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 8,
              border: '1px solid var(--ui-line)',
              background: 'var(--color-bg-1)',
              fontSize: 12,
            }}
          >
            {JSON.stringify(
              {
                scenario: activeScenario,
                syncCalls,
                enableCalls,
                helpClicks,
                scanCode: activeStatus.scanCode,
              },
              null,
              2,
            )}
          </pre>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
