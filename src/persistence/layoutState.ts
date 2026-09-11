export interface StoredGridLayoutColumn {
  key: string;
  visible?: boolean;
  visibleIndex?: number;
  width?: number | string;
  fixed?: boolean;
  fixedPosition?: 'left' | 'right' | 'sticky';
}

export interface StoredGridLayoutV1 {
  version: 1;
  columns: StoredGridLayoutColumn[];
}

export interface LayoutGrid {
  columnCount(): number;
  columnOption(index: number): unknown;
  columnOption(index: number, option: string, value: unknown): void;
  beginUpdate(): void;
  endUpdate(): void;
}

type WarnDuplicate = (key: string) => void;
type ColumnHandle = { index: number; key?: string; options: Record<string, unknown> };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKey(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isIndex(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value)
  );
}

export function isLayoutWidth(value: unknown): value is number | string {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0;
  return (
    typeof value === 'string' &&
    (value === 'auto' ||
      (/^(?:\d+(?:\.\d*)?|\.\d+)(?:px|%)?$/.test(value) &&
        Number.isFinite(Number.parseFloat(value))))
  );
}

function projectColumn(key: string, value: Record<string, unknown>): StoredGridLayoutColumn {
  const column: StoredGridLayoutColumn = { key };
  if (typeof value.visible === 'boolean') column.visible = value.visible;
  if (isIndex(value.visibleIndex)) column.visibleIndex = value.visibleIndex;
  if (isLayoutWidth(value.width)) column.width = value.width;
  if (typeof value.fixed === 'boolean') column.fixed = value.fixed;
  if (
    value.fixedPosition === 'left' ||
    value.fixedPosition === 'right' ||
    value.fixedPosition === 'sticky'
  ) {
    column.fixedPosition = value.fixedPosition;
  }
  return column;
}

function compareKeys(a: { key: string }, b: { key: string }): number {
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function duplicateKeys(keys: string[], warn?: WarnDuplicate): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  duplicates.forEach((key) => warn?.(key));
  return duplicates;
}

export function normalizeGridLayout(
  value: unknown,
  warn?: WarnDuplicate
): StoredGridLayoutV1 | undefined {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.columns)) return undefined;
  const entries = value.columns.filter((entry) => isObject(entry) && isKey(entry.key));
  const duplicates = duplicateKeys(
    entries.map((entry) => entry.key as string),
    warn
  );
  return {
    version: 1,
    columns: entries
      .filter((entry) => !duplicates.has(entry.key as string))
      .map((entry) => projectColumn(entry.key as string, entry))
      .sort(compareKeys),
  };
}

export function areGridLayoutsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeGridLayout(a)) === JSON.stringify(normalizeGridLayout(b));
}

export function getLayoutColumnKey(value: unknown): string | undefined {
  if (!isObject(value) || (typeof value.type === 'string' && value.type.length > 0))
    return undefined;
  return isKey(value.name) ? value.name : isKey(value.dataField) ? value.dataField : undefined;
}

function getColumnHandles(grid: LayoutGrid, warn?: WarnDuplicate): ColumnHandle[] {
  const handles = Array.from({ length: grid.columnCount() }, (_, index) => {
    const value = grid.columnOption(index);
    return { index, key: getLayoutColumnKey(value), options: isObject(value) ? value : {} };
  });
  const duplicates = duplicateKeys(
    handles.flatMap((handle) => (handle.key === undefined ? [] : [handle.key])),
    warn
  );
  return handles.map((handle) =>
    duplicates.has(handle.key ?? '') ? { ...handle, key: undefined } : handle
  );
}

export function captureGridLayout(grid: LayoutGrid, warn?: WarnDuplicate): StoredGridLayoutV1 {
  return {
    version: 1,
    columns: getColumnHandles(grid, warn)
      .flatMap(({ key, options }) => (key === undefined ? [] : [projectColumn(key, options)]))
      .sort(compareKeys),
  };
}

export function restoreGridLayout(
  grid: LayoutGrid,
  layout: StoredGridLayoutV1,
  defaults?: StoredGridLayoutV1,
  warn?: WarnDuplicate
): void {
  const handles = getColumnHandles(grid, warn);
  const saved = new Map(layout.columns.map((column) => [column.key, column]));
  const defaultOrder = new Map(
    defaults?.columns.map((column) => [column.key, column.visibleIndex])
  );
  const ordered = [...handles].sort((a, b) => {
    const aOrder = defaultOrder.get(a.key ?? '') ?? a.options.visibleIndex;
    const bOrder = defaultOrder.get(b.key ?? '') ?? b.options.visibleIndex;
    return (
      (isIndex(aOrder) ? aOrder : a.index) - (isIndex(bOrder) ? bOrder : b.index) ||
      a.index - b.index
    );
  });
  const hasSavedOrder = (handle: ColumnHandle) =>
    handle.key !== undefined && saved.get(handle.key)?.visibleIndex !== undefined;
  const reordered = ordered.filter(hasSavedOrder).sort((a, b) => {
    const difference = saved.get(a.key!)!.visibleIndex! - saved.get(b.key!)!.visibleIndex!;
    return difference || a.index - b.index;
  });
  let next = 0;
  const merged = ordered.map((handle) => (hasSavedOrder(handle) ? reordered[next++]! : handle));

  // Native width handling can render cached summary cells before structural changes update them.
  // Keep widths in a separate batch, then restore visibility/fixing and finally merged order.
  grid.beginUpdate();
  try {
    for (const { index, key } of handles) {
      const column = key === undefined ? undefined : saved.get(key);
      if (column?.width !== undefined) grid.columnOption(index, 'width', column.width);
    }
  } finally {
    grid.endUpdate();
  }
  grid.beginUpdate();
  try {
    for (const { index, key } of handles) {
      const column = key === undefined ? undefined : saved.get(key);
      if (!column) continue;
      for (const option of ['visible', 'fixed', 'fixedPosition'] as const) {
        if (column[option] !== undefined) grid.columnOption(index, option, column[option]);
      }
    }
    for (let visibleIndex = merged.length - 1; visibleIndex >= 0; visibleIndex -= 1) {
      const handle = merged[visibleIndex]!;
      if (hasSavedOrder(handle)) grid.columnOption(handle.index, 'visibleIndex', visibleIndex);
    }
  } finally {
    grid.endUpdate();
  }
}

export function isLayoutOptionPath(fullName: string): boolean {
  return /^columns\[\d+\]\.(?:visible|visibleIndex|width|fixed|fixedPosition)$/.test(fullName);
}
