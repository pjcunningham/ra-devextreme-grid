function isJsonScalar(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

export function validateSummaryResult(
  summary: unknown,
  length: number | undefined,
  field: 'summary' | 'group summary'
): void {
  if (!length) {
    if (summary !== undefined) {
      throw new Error(`DatagridDXRemote getGrid returned an unsolicited ${field}.`);
    }
    return;
  }
  if (!Array.isArray(summary) || summary.length !== length) {
    throw new Error(
      `DatagridDXRemote getGrid ${field} must be an array matching ${field === 'summary' ? 'totalSummary' : 'groupSummary'} length.`
    );
  }
  for (let index = 0; index < summary.length; index++) {
    if (!Object.hasOwn(summary, index) || !isJsonScalar(summary[index])) {
      throw new Error(
        `DatagridDXRemote getGrid ${field} values must be JSON-safe scalars in a dense array.`
      );
    }
  }
}

export function validateGridData(
  data: unknown[],
  depth: number,
  summaryLength: number | undefined,
  groupPaging = false
): void {
  for (let index = 0; index < data.length; index++) {
    if (!Object.hasOwn(data, index)) {
      throw new Error('DatagridDXRemote getGrid data and group items must be dense arrays.');
    }
    const item: unknown = data[index];
    if (depth === 0) {
      if (
        !item ||
        typeof item !== 'object' ||
        Array.isArray(item) ||
        !('id' in item) ||
        !(typeof item.id === 'string' || (typeof item.id === 'number' && Number.isFinite(item.id)))
      ) {
        throw new Error(
          'DatagridDXRemote getGrid records must have a canonical id (string or finite number).'
        );
      }
      continue;
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('DatagridDXRemote getGrid group levels must contain group objects.');
    }
    if (!('key' in item) || !isJsonScalar(item.key)) {
      throw new Error('DatagridDXRemote getGrid group key must be a JSON-safe scalar.');
    }
    const collapsed = groupPaging && 'items' in item && item.items === null;
    if (collapsed || ('count' in item && item.count !== undefined)) {
      const count = 'count' in item ? item.count : undefined;
      if (
        typeof count !== 'number' ||
        !Number.isFinite(count) ||
        !Number.isInteger(count) ||
        count < 0
      ) {
        throw new Error(
          'DatagridDXRemote getGrid group count must be a finite non-negative integer; required for items:null.'
        );
      }
    }
    if (!('items' in item) || (!collapsed && !Array.isArray(item.items))) {
      throw new Error('DatagridDXRemote getGrid group items must be complete arrays, never null.');
    }
    validateSummaryResult(
      'summary' in item ? item.summary : undefined,
      summaryLength,
      'group summary'
    );
    if (!collapsed)
      validateGridData(item.items as unknown[], depth - 1, summaryLength, groupPaging);
  }
}
