import type { LoadOptions } from 'devextreme/common/data';
import type {
  GetGridGroupDescriptor,
  GetGridGroupPagingContext,
  GetGridLoadOptions,
  GetGridSortDescriptor,
  GetGridSummaryDescriptor,
} from './types';

export const MAX_SUMMARY_ITEMS = 32;
export const MAX_GROUP_LEVELS = 4;

export function normalizeTotalSummary(
  value: unknown,
  field: 'totalSummary' | 'groupSummary' = 'totalSummary'
): GetGridSummaryDescriptor[] {
  const items = Array.isArray(value) ? value : [value];
  if (items.length > MAX_SUMMARY_ITEMS) {
    throw new Error(`DatagridDXRemote ${field} supports at most ${MAX_SUMMARY_ITEMS} items.`);
  }
  return Array.from(items, (item: unknown, index) => {
    if (
      !Object.hasOwn(items, index) ||
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(item)) ||
      Reflect.ownKeys(item).some((key) => key !== 'selector' && key !== 'summaryType')
    ) {
      throw new Error(`DatagridDXRemote ${field} requires explicit summary descriptor objects.`);
    }
    const { selector, summaryType } = item as Record<string, unknown>;
    if (
      summaryType !== 'count' &&
      summaryType !== 'sum' &&
      summaryType !== 'avg' &&
      summaryType !== 'min' &&
      summaryType !== 'max'
    ) {
      throw new Error(
        `DatagridDXRemote ${field} supports built-in count, sum, avg, min, max only.`
      );
    }
    if (selector === undefined && summaryType === 'count') return { summaryType };
    if (typeof selector !== 'string' || !selector.trim()) {
      throw new Error(
        `DatagridDXRemote ${field} requires a nonempty string selector except for count.`
      );
    }
    return { selector, summaryType };
  });
}

function rejectFunctions(value: unknown, seen = new WeakSet<object>()): void {
  if (typeof value === 'function') {
    throw new Error('DatagridDXRemote query values must not contain executable functions.');
  }
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) rejectFunctions(child, seen);
}

function isActive(value: unknown): boolean {
  return value != null && !(Array.isArray(value) && value.length === 0);
}

function normalizeSort(value: unknown, groupPaging = false): GetGridSortDescriptor[] {
  return (Array.isArray(value) ? value : [value]).map((item: unknown) => {
    if (typeof item === 'string' && item.trim()) return { selector: item, desc: false };
    if (item && typeof item === 'object' && !Array.isArray(item) && 'selector' in item) {
      const desc = 'desc' in item ? item.desc : undefined;
      if (
        typeof item.selector === 'string' &&
        item.selector.trim() &&
        (desc === undefined || typeof desc === 'boolean')
      ) {
        if (groupPaging && 'isExpanded' in item && typeof item.isExpanded !== 'boolean') {
          throw new Error('DatagridDXRemote sort isExpanded must be boolean.');
        }
        return {
          selector: item.selector,
          desc: desc ?? false,
          ...(groupPaging && 'isExpanded' in item
            ? { isExpanded: item.isExpanded as boolean }
            : {}),
        };
      }
    }
    throw new Error(
      'DatagridDXRemote sort requires a nonempty string selector and a boolean desc.'
    );
  });
}

export function normalizeGroup(value: unknown, groupPaging = false): GetGridGroupDescriptor[] {
  const items = Array.isArray(value) ? value : [value];
  if (items.length > MAX_GROUP_LEVELS) {
    throw new Error(`DatagridDXRemote group supports at most ${MAX_GROUP_LEVELS} levels.`);
  }
  return Array.from(items, (item: unknown, index) => {
    if (
      !Object.hasOwn(items, index) ||
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(item)) ||
      Reflect.ownKeys(item).some(
        (key) => key !== 'selector' && key !== 'desc' && key !== 'isExpanded'
      )
    ) {
      throw new Error(
        'DatagridDXRemote group requires explicit group descriptor objects without extra keys.'
      );
    }
    const { selector, desc, isExpanded } = item as Record<string, unknown>;
    if (
      typeof selector !== 'string' ||
      !selector.trim() ||
      typeof desc !== 'boolean' ||
      typeof isExpanded !== 'boolean'
    ) {
      throw new Error(
        'DatagridDXRemote group requires a nonempty string selector and explicit boolean desc and isExpanded.'
      );
    }
    if (groupPaging && isExpanded) {
      throw new Error(
        'DatagridDXRemote groupPaging requires collapsed descriptors; do not use expandAll().'
      );
    }
    if (!groupPaging && index < items.length - 1 && !isExpanded) {
      throw new Error('DatagridDXRemote group requires isExpanded:true on every nonfinal level.');
    }
    return { selector, desc, isExpanded };
  });
}

export function normalizeLoadOptions<T>(
  options: LoadOptions<T>,
  capabilities: { groupPaging?: boolean; groupPagingContext?: GetGridGroupPagingContext } = {}
): GetGridLoadOptions {
  for (const field of [
    'select',
    'expand',
    'parentIds',
    'customQueryParams',
    'startDate',
    'endDate',
  ] as const) {
    if (isActive(options[field])) throw new Error(`DatagridDXRemote does not support ${field}.`);
  }
  // DataSource supplies inactive search defaults even without a search UI.
  if (
    isActive(options.searchExpr) ||
    (options.searchValue != null && options.searchValue !== '') ||
    (options.searchOperation != null && options.searchOperation !== 'contains')
  ) {
    throw new Error(
      'DatagridDXRemote does not support search inputs; use a native filter expression.'
    );
  }

  const result: GetGridLoadOptions = {};
  const { groupPaging = false, groupPagingContext } = capabilities;
  if (groupPagingContext) {
    if (!groupPaging) throw new Error('DatagridDXRemote groupPagingContext requires groupPaging.');
    const group = normalizeGroup(groupPagingContext.group, true);
    if (!group.length)
      throw new Error('DatagridDXRemote groupPagingContext requires configured groups.');
    const filter = groupPagingContext.filter;
    rejectFunctions(filter);
    if (filter !== null && !Array.isArray(filter)) {
      throw new Error('DatagridDXRemote groupPagingContext filter must be an array or null.');
    }
    result.groupPagingContext = { group, filter };
  }
  const lazy = result.groupPagingContext !== undefined;
  if (isActive(options.group)) {
    if (groupPaging && !lazy)
      throw new Error('DatagridDXRemote grouped paging requires groupPagingContext.');
    result.group = normalizeGroup(options.group, lazy);
    if (lazy && result.group.length !== 1) {
      throw new Error('DatagridDXRemote groupPaging requests exactly one collapsed group level.');
    }
    if (
      lazy &&
      !result.groupPagingContext!.group.some(
        (descriptor) =>
          descriptor.selector === result.group![0]!.selector &&
          descriptor.desc === result.group![0]!.desc
      )
    )
      throw new Error('DatagridDXRemote requested group must match groupPagingContext.');
  }
  if (options.requireGroupCount !== undefined) {
    if (typeof options.requireGroupCount !== 'boolean') {
      throw new Error('DatagridDXRemote requireGroupCount must be boolean.');
    }
    if (options.requireGroupCount && !result.group) {
      throw new Error('DatagridDXRemote requireGroupCount requires an active group.');
    }
    if (result.group || lazy) result.requireGroupCount = options.requireGroupCount;
  }
  if (isActive(options.groupSummary)) {
    if (!result.group && !lazy) {
      throw new Error('DatagridDXRemote groupSummary requires an active group.');
    }
    result.groupSummary = normalizeTotalSummary(options.groupSummary, 'groupSummary');
  }
  for (const field of ['skip', 'take'] as const) {
    const value = options[field];
    rejectFunctions(value);
    if (value !== undefined) {
      if (result.group && !lazy) {
        throw new Error(`DatagridDXRemote grouped loads do not support explicit ${field}.`);
      }
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        !Number.isInteger(value)
      ) {
        throw new Error(`DatagridDXRemote ${field} must be a finite non-negative integer.`);
      }
      if (lazy && field === 'take' && (value === 0 || value > 100)) {
        throw new Error('DatagridDXRemote groupPaging take must be between 1 and 100.');
      }
      result[field] = value;
    }
  }
  if (options.requireTotalCount !== undefined) {
    rejectFunctions(options.requireTotalCount);
    if (typeof options.requireTotalCount !== 'boolean') {
      throw new Error('DatagridDXRemote requireTotalCount must be boolean.');
    }
    result.requireTotalCount = options.requireTotalCount;
  }
  rejectFunctions(options.sort);
  if (options.sort != null) result.sort = normalizeSort(options.sort, lazy);
  rejectFunctions(options.filter);
  if (options.filter !== undefined) {
    if (options.filter !== null && !Array.isArray(options.filter)) {
      throw new Error('DatagridDXRemote filter must be a native expression array or null.');
    }
    result.filter = options.filter;
  }
  if (isActive(options.totalSummary)) {
    result.totalSummary = normalizeTotalSummary(options.totalSummary);
  }
  return result;
}
