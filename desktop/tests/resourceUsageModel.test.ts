import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterAndSortInventoryResources,
  isNonMasteryGoal,
  resourceConsumers,
  resourceProgress,
  type ResourceConsumerItem,
} from '../src/resourceUsageModel.ts';
import type { ResourceRequirement } from '../src/resourcePlan.ts';

test('isNonMasteryGoal flags zero or missing maxRank without misclassifying mastery gear', () => {
  assert.equal(isNonMasteryGoal(undefined), true);
  assert.equal(isNonMasteryGoal({ maxRank: 0 }), true);
  assert.equal(isNonMasteryGoal({ maxRank: 30 }), false);
  assert.equal(isNonMasteryGoal({ maxRank: 40 }), false);
});

test('resourceProgress computes coverage percent, unknown fallback and zero-need state', () => {
  const plan = {
    inventoryKnown: true,
    incomplete: false,
    requirements: {
      cryo: {
        needed: 1000,
        owned: 250,
        allocated: 200,
        pending: 50,
        fromBatches: 100,
        missing: 650,
        crafts: 0,
        usedBy: ['a'],
      },
      ok: {
        needed: 500,
        owned: 500,
        allocated: 500,
        pending: 0,
        fromBatches: 0,
        missing: 0,
        crafts: 0,
        usedBy: ['b'],
      },
    },
  };

  assert.deepEqual(resourceProgress(plan, 'cryo'), {
    known: true,
    incomplete: false,
    needed: 1000,
    covered: 350,
    missing: 650,
    percent: 35,
  });
  assert.deepEqual(resourceProgress(plan, 'ok'), {
    known: true,
    incomplete: false,
    needed: 500,
    covered: 500,
    missing: 0,
    percent: 100,
  });
  assert.deepEqual(resourceProgress(plan, 'unused'), {
    known: true,
    incomplete: false,
    needed: 0,
    covered: 0,
    missing: 0,
    percent: 100,
  });
  assert.equal(resourceProgress({ ...plan, inventoryKnown: false }, 'cryo').known, false);
});

test('resourceConsumers sorts by quantity descending, then mastery gear, then name, and detects shared batch', () => {
  const req: ResourceRequirement = {
    needed: 39000,
    owned: 0,
    allocated: 0,
    pending: 0,
    fromBatches: 0,
    missing: 39000,
    crafts: 0,
    usedBy: ['antigen', 'vauban', 'sibear', 'shared'],
    demandByGoal: {
      sibear: 30000,
      vauban: 9000,
      antigen: 9000,
    },
  };
  const items = new Map<string, ResourceConsumerItem>([
    ['sibear', { name: 'Sibear', maxRank: 30, category: 'melee' }],
    ['vauban', { name: 'Vauban Prime', maxRank: 30, category: 'warframe' }],
    ['antigen', { name: 'Antigen Part', maxRank: 0, category: 'pet' }],
    ['shared', { name: 'Shared Goal', maxRank: 30, category: 'primary' }],
  ]);

  const rows = resourceConsumers(req, items, (id) => items.get(id)?.name ?? id);
  assert.deepEqual(
    rows.map((r) => ({ id: r.id, quantity: r.quantity, sharedBatch: r.sharedBatch, hasMastery: r.hasMastery })),
    [
      { id: 'sibear', quantity: 30000, sharedBatch: false, hasMastery: true },
      { id: 'vauban', quantity: 9000, sharedBatch: false, hasMastery: true },
      { id: 'antigen', quantity: 9000, sharedBatch: false, hasMastery: false },
      { id: 'shared', quantity: 0, sharedBatch: true, hasMastery: true },
    ],
  );
});

test('filterAndSortInventoryResources supports zero-owned missing resources and shortage/needed sorting', () => {
  const resources = [
    { id: 'ferrite', name: 'Ferrite' },
    { id: 'cryo', name: 'Cryotic' },
    { id: 'nitain', name: 'Nitain Extract' },
    { id: 'rubedo', name: 'Rubedo' },
  ];
  const ownedMap: Record<string, number> = {
    ferrite: 50000,
    cryo: 11100,
    nitain: 0,
    rubedo: 0,
  };
  const remainingPlan = {
    inventoryKnown: true,
    incomplete: false,
    requirements: {
      ferrite: { needed: 20000, owned: 50000, allocated: 20000, pending: 0, fromBatches: 0, missing: 0, crafts: 0, usedBy: ['a'] },
      cryo: { needed: 123590, owned: 11100, allocated: 11100, pending: 0, fromBatches: 0, missing: 112490, crafts: 0, usedBy: ['b'] },
      nitain: { needed: 222, owned: 0, allocated: 0, pending: 0, fromBatches: 0, missing: 222, crafts: 0, usedBy: ['c'] },
    } as Record<string, ResourceRequirement>,
  };

  const baseOpts = {
    search: '',
    matchesSearch: (item: { name: string }, q: string) => item.name.toLowerCase().includes(q.toLowerCase()),
    owned: (id: string) => ownedMap[id] ?? 0,
    remainingPlan,
    displayName: (item: { name: string }) => item.name,
  };

  const missingOnly = filterAndSortInventoryResources(resources, {
    ...baseOpts,
    filter: 'missing',
    order: 'shortage',
  });
  assert.deepEqual(missingOnly.map((r) => r.id), ['cryo', 'nitain']);

  const byNeeded = filterAndSortInventoryResources(resources, {
    ...baseOpts,
    filter: 'all',
    order: 'needed',
  });
  assert.deepEqual(byNeeded.map((r) => r.id), ['cryo', 'ferrite', 'nitain', 'rubedo']);

  const byQty = filterAndSortInventoryResources(resources, {
    ...baseOpts,
    filter: 'owned',
    order: 'quantity',
  });
  assert.deepEqual(byQty.map((r) => r.id), ['ferrite', 'cryo']);
});
