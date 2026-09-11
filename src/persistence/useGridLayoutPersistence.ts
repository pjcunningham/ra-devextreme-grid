import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { IDataGridOptions } from 'devextreme-react/data-grid';
import { useStoreContext, type RaRecord, type Store } from 'react-admin';
import {
  areGridLayoutsEqual,
  captureGridLayout,
  isLayoutOptionPath,
  normalizeGridLayout,
  restoreGridLayout,
  type LayoutGrid,
  type StoredGridLayoutV1,
} from './layoutState';

function createPersistence(store: Store, key: string | undefined) {
  let active = false;
  let grid: LayoutGrid | undefined;
  let defaults: StoredGridLayoutV1 | undefined;
  let stored: StoredGridLayoutV1 | undefined;
  let lastLayout: StoredGridLayoutV1 | undefined;
  let pending: StoredGridLayoutV1 | undefined;
  let writing: StoredGridLayoutV1 | undefined;
  let restoring = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let unsubscribe: (() => void) | undefined;
  let storeOperationDepth = 0;
  let queuedValues: unknown[] = [];
  let generation = 0;
  const warned = new Set<string>();

  function warn(code: string, message: string) {
    if (warned.has(code)) return;
    warned.add(code);
    console.warn(`[ra-devextreme-grid] Layout persistence (${key}): ${message}`);
  }

  const warnDuplicate = (columnKey: string) =>
    warn(`duplicate:${columnKey}`, `Duplicate column key "${columnKey}" was skipped.`);

  function cancelPending() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    generation += 1;
  }

  function applyStored() {
    if (!grid || restoring) return;
    restoring = true;
    try {
      if (stored) restoreGridLayout(grid, stored, defaults, warnDuplicate);
      lastLayout = captureGridLayout(grid, warnDuplicate);
    } finally {
      restoring = false;
    }
  }

  function receive(value: unknown) {
    if (!active) return;
    if (storeOperationDepth > 0) {
      queuedValues.push(value);
      return;
    }
    if (value === undefined) {
      cancelPending();
      stored = undefined;
      lastLayout = grid ? captureGridLayout(grid, warnDuplicate) : undefined;
      return;
    }
    const layout = normalizeGridLayout(value, warnDuplicate);
    if (!layout) return;
    if (writing && areGridLayoutsEqual(writing, layout)) return;
    if (!pending && areGridLayoutsEqual(stored, layout)) return;
    cancelPending();
    stored = layout;
    applyStored();
  }

  function storeOperation<T>(operation: string, callback: () => T): { value: T } | undefined {
    let result: { value: T } | undefined;
    storeOperationDepth += 1;
    try {
      result = { value: callback() };
    } catch {
      warn(operation, `Store ${operation} failed.`);
    } finally {
      storeOperationDepth -= 1;
    }
    if (storeOperationDepth === 0) {
      const values = queuedValues;
      queuedValues = [];
      values.forEach(receive);
    }
    return result;
  }

  function flush() {
    const layout = pending;
    cancelPending();
    if (key === undefined || !layout || areGridLayoutsEqual(layout, lastLayout)) return;
    lastLayout = layout;
    const current = storeOperation('read', () => store.getItem<unknown>(key));
    if (current && areGridLayoutsEqual(current.value, layout)) {
      stored = layout;
      return;
    }
    writing = layout;
    try {
      const result = storeOperation('write', () => store.setItem(key, layout));
      if (result) stored = layout;
    } finally {
      writing = undefined;
    }
  }

  function start() {
    if (active || key === undefined) return;
    active = true;
    unsubscribe = storeOperation('subscribe', () => store.subscribe(key, receive))?.value;
    const current = storeOperation('read', () => store.getItem<unknown>(key));
    if (current) receive(current.value);
    window.addEventListener('pagehide', flush);
  }

  function ready(component: LayoutGrid) {
    if (key === undefined) return;
    start();
    if (restoring || (grid === component && defaults)) return;
    if (component.columnCount() === 0) return;
    grid = component;
    defaults = captureGridLayout(component, warnDuplicate);
    applyStored();
  }

  function changed(component: LayoutGrid, fullName: string) {
    if (!active || grid !== component || !defaults || restoring || !isLayoutOptionPath(fullName))
      return;
    if (timer !== undefined) clearTimeout(timer);
    pending = captureGridLayout(component, warnDuplicate);
    const currentGeneration = ++generation;
    // Reorder notifications can precede the native updates to the shifted columns.
    queueMicrotask(() => {
      if (active && grid === component && pending && generation === currentGeneration) {
        pending = captureGridLayout(component, warnDuplicate);
      }
    });
    timer = setTimeout(() => {
      if (pending && grid === component) pending = captureGridLayout(component, warnDuplicate);
      flush();
    }, 200);
  }

  function dispose(component: LayoutGrid) {
    if (grid !== component) return;
    if (pending) pending = captureGridLayout(component, warnDuplicate);
    grid = undefined;
    defaults = undefined;
    flush();
  }

  function stop() {
    flush();
    active = false;
    window.removeEventListener('pagehide', flush);
    if (unsubscribe) storeOperation('unsubscribe', unsubscribe);
    unsubscribe = undefined;
  }

  return { start, ready, changed, dispose, stop };
}

export function useGridLayoutPersistence<RecordType extends RaRecord>(key?: string) {
  const store = useStoreContext();
  const componentRef = useRef<LayoutGrid | undefined>(undefined);
  const persistence = useMemo(() => createPersistence(store, key), [store, key]);

  useEffect(() => {
    persistence.start();
    if (componentRef.current) persistence.ready(componentRef.current);
    return persistence.stop;
  }, [persistence]);

  const handleLayoutContentReady = useCallback(
    (
      event: Parameters<
        NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onContentReady']>
      >[0]
    ) => {
      componentRef.current = event.component;
      persistence.ready(event.component);
    },
    [persistence]
  );

  const handleLayoutOptionChanged = useCallback(
    (
      event: Parameters<
        NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onOptionChanged']>
      >[0]
    ) => {
      persistence.changed(event.component, event.fullName);
    },
    [persistence]
  );

  const handleLayoutDisposing = useCallback(
    (
      event: Parameters<
        NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onDisposing']>
      >[0]
    ) => {
      if (componentRef.current === event.component) componentRef.current = undefined;
      persistence.dispose(event.component);
    },
    [persistence]
  );

  return { handleLayoutContentReady, handleLayoutOptionChanged, handleLayoutDisposing };
}
