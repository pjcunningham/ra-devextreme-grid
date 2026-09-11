import type { LoadOptions } from 'devextreme/common/data';
import type { GetGridLoadOptions, GetGridSortDescriptor } from './types';

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

function normalizeSort(value: unknown): GetGridSortDescriptor[] {
  return (Array.isArray(value) ? value : [value]).map((item: unknown) => {
    if (typeof item === 'string' && item.trim()) return { selector: item, desc: false };
    if (item && typeof item === 'object' && !Array.isArray(item) && 'selector' in item) {
      const desc = 'desc' in item ? item.desc : undefined;
      if (
        typeof item.selector === 'string' &&
        item.selector.trim() &&
        (desc === undefined || typeof desc === 'boolean')
      ) {
        return { selector: item.selector, desc: desc ?? false };
      }
    }
    throw new Error(
      'DatagridDXRemote sort requires a nonempty string selector and a boolean desc.'
    );
  });
}

export function normalizeLoadOptions<T>(options: LoadOptions<T>): GetGridLoadOptions {
  for (const field of ['group', 'groupSummary', 'totalSummary'] as const) {
    if (isActive(options[field])) {
      throw new Error(
        `DatagridDXRemote does not support ${field}: grouping and summaries are unavailable in Phase 5.`
      );
    }
  }
  if (options.requireGroupCount) {
    throw new Error('DatagridDXRemote does not support requireGroupCount in Phase 5.');
  }
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
  for (const field of ['skip', 'take'] as const) {
    const value = options[field];
    rejectFunctions(value);
    if (value !== undefined) {
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < 0 ||
        !Number.isInteger(value)
      ) {
        throw new Error(`DatagridDXRemote ${field} must be a finite non-negative integer.`);
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
  if (options.sort != null) result.sort = normalizeSort(options.sort);
  rejectFunctions(options.filter);
  if (options.filter !== undefined) {
    if (options.filter !== null && !Array.isArray(options.filter)) {
      throw new Error('DatagridDXRemote filter must be a native expression array or null.');
    }
    result.filter = options.filter;
  }
  return result;
}
