import type { ResourceRequirement } from './resourcePlan.ts';

export type ResourcePlanSummary = {
  inventoryKnown: boolean;
  incomplete: boolean;
  requirements: Record<string, ResourceRequirement>;
};

export type ResourceProgress = {
  known: boolean;
  incomplete: boolean;
  needed: number;
  covered: number;
  missing: number;
  percent: number;
};

export type ResourceConsumerItem = {
  name: string;
  zh?: string;
  maxRank?: number;
  category?: string;
  masteryReq?: number;
};

export type ResourceConsumerRow = {
  id: string;
  quantity: number | null;
  sharedBatch: boolean;
  hasMastery: boolean;
  category?: string;
  masteryReq?: number;
};

export type ResourceInventoryFilter = 'all' | 'owned' | 'missing';
export type ResourceInventoryOrder = 'name' | 'quantity' | 'shortage' | 'needed';

export type FilterInventoryOptions<T extends { id: string }> = {
  filter: ResourceInventoryFilter;
  order: ResourceInventoryOrder;
  search: string;
  matchesSearch: (item: T, query: string) => boolean;
  owned: (id: string) => number | null;
  remainingPlan: ResourcePlanSummary | null | undefined;
  displayName: (item: T) => string;
};

export function isNonMasteryGoal(item: { maxRank?: number } | undefined): boolean {
  return !((item?.maxRank ?? 0) > 0);
}

export function resourceProgress(
  plan: ResourcePlanSummary | null | undefined,
  id: string,
): ResourceProgress {
  if (!plan?.inventoryKnown) {
    return {
      known: false,
      incomplete: plan?.incomplete ?? false,
      needed: 0,
      covered: 0,
      missing: 0,
      percent: 0,
    };
  }
  const row = plan.requirements[id];
  if (!row || row.needed <= 0) {
    return {
      known: true,
      incomplete: plan.incomplete,
      needed: 0,
      covered: 0,
      missing: 0,
      percent: 100,
    };
  }
  const covered = Math.min(row.needed, row.allocated + row.pending + row.fromBatches);
  const percent = Math.min(100, Math.round((covered / row.needed) * 100));
  return {
    known: true,
    incomplete: plan.incomplete,
    needed: row.needed,
    covered,
    missing: row.missing,
    percent,
  };
}

export function resourceConsumers(
  requirement: ResourceRequirement | null | undefined,
  items: ReadonlyMap<string, ResourceConsumerItem>,
  displayName: (id: string) => string,
): ResourceConsumerRow[] {
  if (!requirement?.usedBy.length) return [];
  const demandByGoal = requirement.demandByGoal;
  const rows: ResourceConsumerRow[] = requirement.usedBy.map((id) => {
    const item = items.get(id);
    const hasDemandMap = demandByGoal !== undefined;
    const quantity = hasDemandMap ? (demandByGoal[id] ?? 0) : null;
    return {
      id,
      quantity,
      sharedBatch: hasDemandMap && quantity === 0,
      hasMastery: !isNonMasteryGoal(item),
      category: item?.category,
      masteryReq: item?.masteryReq,
    };
  });
  rows.sort(
    (a, b) =>
      (b.quantity ?? 0) - (a.quantity ?? 0) ||
      Number(b.hasMastery) - Number(a.hasMastery) ||
      displayName(a.id).localeCompare(displayName(b.id)) ||
      a.id.localeCompare(b.id),
  );
  return rows;
}

export function filterAndSortInventoryResources<T extends { id: string }>(
  items: readonly T[],
  options: FilterInventoryOptions<T>,
): T[] {
  const query = options.search.trim();
  const reqs = options.remainingPlan?.inventoryKnown
    ? options.remainingPlan.requirements
    : undefined;

  const filtered = items.filter((item) => {
    if (query && !options.matchesSearch(item, query)) return false;
    if (options.filter === 'owned') return (options.owned(item.id) ?? 0) > 0;
    if (options.filter === 'missing') return (reqs?.[item.id]?.missing ?? 0) > 0;
    return true;
  });

  return filtered.sort((a, b) => {
    const ra = reqs?.[a.id];
    const rb = reqs?.[b.id];
    const nameCmp =
      options.displayName(a).localeCompare(options.displayName(b)) ||
      a.id.localeCompare(b.id);

    if (options.order === 'shortage') {
      return (
        (rb?.missing ?? 0) - (ra?.missing ?? 0) ||
        (rb?.needed ?? 0) - (ra?.needed ?? 0) ||
        nameCmp
      );
    }
    if (options.order === 'needed') {
      return (
        (rb?.needed ?? 0) - (ra?.needed ?? 0) ||
        (rb?.missing ?? 0) - (ra?.missing ?? 0) ||
        nameCmp
      );
    }
    if (options.order === 'quantity') {
      return (options.owned(b.id) ?? -1) - (options.owned(a.id) ?? -1) || nameCmp;
    }
    return nameCmp;
  });
}
