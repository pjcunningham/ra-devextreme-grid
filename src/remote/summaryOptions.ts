import { MAX_SUMMARY_ITEMS } from './loadOptions';

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error(`DatagridDXRemote ${path} must be a summary option object.`);
  }
  return value as Record<string, unknown>;
}

function validateSkipEmptyValues(value: unknown, path: string): void {
  if (value !== undefined && value !== true) {
    throw new Error(`DatagridDXRemote ${path}.skipEmptyValues must be omitted or true.`);
  }
}

export function validateSummaryOptions(value: unknown): void {
  if (value == null) return;
  const options = requireObject(value, 'summary');
  if (options.calculateCustomSummary != null) {
    throw new Error('DatagridDXRemote summary.calculateCustomSummary is not supported.');
  }
  if (options.recalculateWhileEditing !== undefined && options.recalculateWhileEditing !== false) {
    throw new Error('DatagridDXRemote summary.recalculateWhileEditing must be omitted or false.');
  }
  validateSkipEmptyValues(options.skipEmptyValues, 'summary');

  for (const collection of ['totalItems', 'groupItems'] as const) {
    const items = options[collection];
    if (items == null) continue;
    if (!Array.isArray(items)) {
      throw new Error(`DatagridDXRemote summary.${collection} must be an array.`);
    }
    if (items.length > MAX_SUMMARY_ITEMS) {
      throw new Error(
        `DatagridDXRemote summary.${collection} supports at most ${MAX_SUMMARY_ITEMS} items.`
      );
    }
    for (let index = 0; index < items.length; index += 1) {
      const path = `summary.${collection}[${index}]`;
      const item = requireObject(items[index], path);
      validateSkipEmptyValues(item.skipEmptyValues, path);
      const { summaryType, column } = item;
      if (
        summaryType !== 'count' &&
        summaryType !== 'sum' &&
        summaryType !== 'avg' &&
        summaryType !== 'min' &&
        summaryType !== 'max'
      ) {
        throw new Error(
          `DatagridDXRemote ${path}.summaryType must be an explicit count, sum, avg, min, max.`
        );
      }
      if (column === undefined && summaryType === 'count') continue;
      if (typeof column !== 'string' || !column.trim()) {
        throw new Error(
          `DatagridDXRemote ${path}.column must be a nonempty string except for count.`
        );
      }
    }
  }
}
