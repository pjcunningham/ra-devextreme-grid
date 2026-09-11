import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoreContextProvider, memoryStore, type Store } from 'react-admin';
import DataGrid from 'devextreme/ui/data_grid';
import { captureGridLayout } from '../src/persistence/layoutState';
import { useGridLayoutPersistence } from '../src/persistence/useGridLayoutPersistence';

type Row = { id: number; a: string; b: string };
type Grid = DataGrid<Row, number>;
type Handlers = ReturnType<typeof useGridLayoutPersistence<Row>>;
const key = 'unchanged.layout.key';
const saved = {
  version: 1,
  columns: [
    { key: 'a', visible: false, width: 180 },
    { key: 'b', width: '25%' },
  ],
};
const disposers: (() => void)[] = [];

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function mount(
  initial: unknown = undefined,
  preferenceKey?: string,
  suppliedStore?: Store,
  strict = false
) {
  const store = suppliedStore ?? memoryStore(initial === undefined ? {} : { [key]: initial });
  const read = vi.spyOn(store, 'getItem');
  const write = vi.spyOn(store, 'setItem');
  const subscribe = vi.spyOn(store, 'subscribe');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreContextProvider value={store}>
      {strict ? <StrictMode>{children}</StrictMode> : children}
    </StoreContextProvider>
  );
  const hook = renderHook(
    ({ layoutKey }: { layoutKey: string | undefined }) => useGridLayoutPersistence<Row>(layoutKey),
    {
      initialProps: { layoutKey: arguments.length > 1 ? preferenceKey : key },
      wrapper,
    }
  );
  const host = document.createElement('div');
  document.body.append(host);
  let isDisposed = false;
  const grid = new DataGrid<Row, number>(host, {
    dataSource: [],
    columns: [{ dataField: 'id' }, { dataField: 'a' }, { dataField: 'b' }],
    onContentReady: (event) => hook.result.current.handleLayoutContentReady(event),
    onOptionChanged: (event) => hook.result.current.handleLayoutOptionChanged(event),
    onDisposing: (event) => hook.result.current.handleLayoutDisposing(event),
  });
  function ready() {
    hook.result.current.handleLayoutContentReady({ component: grid, element: host });
  }
  act(ready);
  const dispose = () => {
    if (isDisposed) return;
    isDisposed = true;
    act(() => grid.dispose());
  };
  disposers.push(() => {
    dispose();
    hook.unmount();
    host.remove();
  });
  const change = (option: string, value: unknown, index = 1) =>
    act(() => grid.columnOption(index, option, value));
  return { ...hook, store, read, write, subscribe, grid, change, ready, dispose };
}

async function tick(ms = 200) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useGridLayoutPersistence', () => {
  it('does no Store operations when the key is absent', async () => {
    const mounted = mount(undefined, undefined);
    mounted.rerender({ layoutKey: undefined });
    mounted.change('width', 200);
    await tick();
    act(() => window.dispatchEvent(new Event('pagehide')));
    mounted.dispose();
    mounted.unmount();
    expect(mounted.read).not.toHaveBeenCalled();
    expect(mounted.subscribe).not.toHaveBeenCalled();
    expect(mounted.write).not.toHaveBeenCalled();
  });

  it('restores once with exact key, ignores restore events and omits auto measured widths', async () => {
    const mounted = mount(saved);
    expect(mounted.grid.columnOption(1, 'visible')).toBe(false);
    expect(mounted.grid.columnOption(1, 'width')).toBe(180);
    expect(mounted.grid.columnOption(2, 'width')).toBe('25%');
    expect(mounted.subscribe).toHaveBeenCalledWith(key, expect.any(Function));
    mounted.ready();
    await tick();
    expect(mounted.write).not.toHaveBeenCalled();
    mounted.change('width', 220);
    await tick();
    expect(mounted.write).toHaveBeenCalledExactlyOnceWith(key, captureGridLayout(mounted.grid));
    expect(mounted.store.getItem<{ columns: unknown[] }>(key)?.columns).toContainEqual(
      expect.objectContaining({ key: 'id' })
    );
    expect(
      captureGridLayout(mounted.grid).columns.find((column) => column.key === 'id')
    ).not.toHaveProperty('width');
    mounted.ready();
    expect(mounted.grid.columnOption(1, 'width')).toBe(220);
    await tick();
    expect(mounted.write).toHaveBeenCalledOnce();
  });

  it('uses a 200ms trailing debounce and captures all finalized reorder indices', async () => {
    const mounted = mount();
    mounted.change('width', 200);
    await tick(150);
    mounted.change('visibleIndex', 0, 2);
    await tick(199);
    expect(mounted.write).not.toHaveBeenCalled();
    await tick(1);
    expect(mounted.write).toHaveBeenCalledExactlyOnceWith(key, captureGridLayout(mounted.grid));
    expect(mounted.store.getItem(key)).toMatchObject({
      columns: [
        { key: 'a', visibleIndex: 2, width: 200 },
        { key: 'b', visibleIndex: 0 },
        { key: 'id', visibleIndex: 1 },
      ],
    });
  });

  it('ignores query and internal width events and never saves an initial snapshot', async () => {
    const mounted = mount();
    for (const fullName of [
      'columns',
      'columns[1].sortOrder',
      'columns[1].filterValue',
      'columns[1].groupIndex',
      'columns[1].visibleWidth',
      'columns[1].adaptiveHidden',
      'pageIndex',
    ]) {
      act(() =>
        mounted.result.current.handleLayoutOptionChanged({
          component: mounted.grid,
          element: document.createElement('div'),
          name: fullName,
          fullName,
          value: 1,
          previousValue: 0,
        })
      );
    }
    await tick();
    expect(mounted.write).not.toHaveBeenCalled();
  });

  it('does not save a burst that returns to the current layout', async () => {
    const mounted = mount(saved);
    mounted.change('width', 201);
    mounted.change('width', 180);
    await tick();
    expect(mounted.write).not.toHaveBeenCalled();
  });

  it.each(['dispose', 'unmount', 'pagehide'] as const)(
    'flushes pending layout on %s without a later duplicate',
    async (boundary) => {
      const mounted = mount();
      mounted.change('visibleIndex', 0, 2);
      await tick(0);
      const finalLayout = captureGridLayout(mounted.grid);
      if (boundary === 'dispose') mounted.dispose();
      if (boundary === 'unmount') mounted.unmount();
      if (boundary === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
      expect(mounted.write).toHaveBeenCalledExactlyOnceWith(key, finalLayout);
      await tick();
      expect(mounted.write).toHaveBeenCalledOnce();
    }
  );

  it('flushes pagehide through the captured Store and removes its listener on cleanup', async () => {
    const mounted = mount();
    mounted.change('width', 204);
    await tick(0);
    const nativeRead = vi.spyOn(mounted.grid, 'columnOption');
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(nativeRead).not.toHaveBeenCalled();
    expect(mounted.write).toHaveBeenCalledOnce();
    mounted.unmount();
    const reads = mounted.read.mock.calls.length;
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(mounted.read).toHaveBeenCalledTimes(reads);
  });

  it('captures finalized order on immediate unmount before queued capture runs', () => {
    const mounted = mount();
    mounted.change('visibleIndex', 0, 2);
    const finalLayout = captureGridLayout(mounted.grid);
    mounted.unmount();
    expect(mounted.write).toHaveBeenCalledExactlyOnceWith(key, finalLayout);
  });

  it('flushes old key before applying a new key on an already mounted grid', async () => {
    const mounted = mount();
    mounted.store.setItem('new-key', { version: 1, columns: [{ key: 'a', width: 310 }] });
    mounted.write.mockClear();
    mounted.change('width', 205);
    await tick(0);
    mounted.rerender({ layoutKey: 'new-key' });
    expect(mounted.write).toHaveBeenCalledExactlyOnceWith(
      key,
      expect.objectContaining({
        columns: expect.arrayContaining([expect.objectContaining({ key: 'a', width: 205 })]),
      })
    );
    expect(mounted.grid.columnOption(1, 'width')).toBe(310);
    await tick();
    expect(mounted.write).toHaveBeenCalledOnce();
  });

  it('flushes and unsubscribes when disabled without accessing an absent key', async () => {
    const mounted = mount();
    mounted.change('width', 205);
    mounted.rerender({ layoutKey: undefined });
    expect(mounted.write).toHaveBeenCalledOnce();
    mounted.read.mockClear();
    mounted.write.mockClear();
    mounted.change('width', 210);
    await tick();
    expect(mounted.read).not.toHaveBeenCalled();
    expect(mounted.write).not.toHaveBeenCalled();
    expect(mounted.subscribe).toHaveBeenCalledOnce();
  });

  it('adopts external valid updates, cancels older pending saves, and does not echo', async () => {
    const mounted = mount(saved);
    mounted.change('width', 205);
    act(() =>
      mounted.store.setItem(key, { version: 1, columns: [{ key: 'a', width: 330, visible: true }] })
    );
    expect(mounted.grid.columnOption(1, 'width')).toBe(330);
    expect(mounted.grid.columnOption(1, 'visible')).toBe(true);
    await tick();
    expect(mounted.write).toHaveBeenCalledOnce();
    expect(mounted.store.getItem(key)).toEqual({
      version: 1,
      columns: [{ key: 'a', width: 330, visible: true }],
    });
  });

  it('ignores invalid updates and removal live; a remount uses defaults after removal', async () => {
    const mounted = mount(saved);
    act(() => mounted.store.setItem(key, { version: 2, columns: [{ key: 'a', width: 330 }] }));
    expect(mounted.grid.columnOption(1, 'width')).toBe(180);
    act(() => mounted.store.removeItem(key));
    expect(mounted.grid.columnOption(1, 'width')).toBe(180);
    mounted.dispose();
    mounted.unmount();
    mounted.write.mockClear();
    const replacement = mount(undefined, key, mounted.store);
    expect(replacement.grid.columnOption(1, 'width')).toBeUndefined();
    await tick();
    expect(replacement.write).not.toHaveBeenCalled();
  });

  it('uses the supplied empty key verbatim rather than treating it as disabled', async () => {
    const mounted = mount(undefined, '');
    mounted.change('width', 250);
    await tick();
    expect(mounted.write).toHaveBeenCalledExactlyOnceWith('', captureGridLayout(mounted.grid));
  });

  it.each(['debounce', 'pagehide', 'dispose', 'unmount', 'key change'])(
    'does not resurrect a removed preference through %s after a pending change',
    async (boundary) => {
      const mounted = mount(saved);
      mounted.change('width', 205);
      act(() => mounted.store.removeItem(key));
      expect(mounted.grid.columnOption(1, 'width')).toBe(205);
      expect(mounted.grid.columnOption(1, 'visible')).toBe(false);
      if (boundary === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
      if (boundary === 'dispose') mounted.dispose();
      if (boundary === 'unmount') mounted.unmount();
      if (boundary === 'key change') mounted.rerender({ layoutKey: 'other.layout' });
      await tick();
      expect(mounted.write).not.toHaveBeenCalled();
      expect(mounted.store.getItem(key)).toBeUndefined();
      mounted.dispose();
      mounted.unmount();
      const replacement = mount(undefined, key, mounted.store);
      expect(replacement.grid.columnOption(1, 'width')).toBeUndefined();
      expect(replacement.grid.columnOption(1, 'visible')).toBe(true);
      await tick();
      expect(replacement.write).not.toHaveBeenCalled();
    }
  );

  it('can save a later genuine change back to the old layout after removal', async () => {
    const mounted = mount(saved);
    mounted.change('width', 205);
    act(() => mounted.store.removeItem(key));
    mounted.change('width', 180);
    await tick();
    expect(mounted.write).toHaveBeenCalledExactlyOnceWith(key, captureGridLayout(mounted.grid));
  });

  it('clears cached stored layout when a removed preference gets a replacement grid', () => {
    const mounted = mount(saved);
    act(() => mounted.store.removeItem(key));
    mounted.dispose();
    const host = document.createElement('div');
    const grid: Grid = new DataGrid<Row, number>(host, {
      dataSource: [],
      columns: [{ dataField: 'id' }, { dataField: 'a' }, { dataField: 'b' }],
    });
    try {
      act(() =>
        mounted.result.current.handleLayoutContentReady({ component: grid, element: host })
      );
      expect(grid.columnOption(1, 'width')).toBeUndefined();
      expect(grid.columnOption(1, 'visible')).toBe(true);
      expect(mounted.write).not.toHaveBeenCalled();
    } finally {
      act(() => mounted.result.current.handleLayoutDisposing({ component: grid, element: host }));
      grid.dispose();
    }
  });

  it('deduplicates Store failures and keeps native layout usable', async () => {
    const store = memoryStore();
    store.getItem = () => {
      throw new Error('read');
    };
    store.setItem = () => {
      throw new Error('write');
    };
    store.subscribe = () => {
      throw new Error('subscribe');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mounted = mount(undefined, key, store);
    mounted.change('width', 250);
    await tick();
    mounted.change('width', 260);
    await tick();
    expect(mounted.grid.columnOption(1, 'width')).toBe(260);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(warn.mock.calls.flat().join(' ')).toContain('Store write failed');
  });

  it('catches unsubscribe failures without swallowing unrelated native errors', () => {
    const store = memoryStore();
    const originalSubscribe = store.subscribe;
    store.subscribe = (storeKey, callback) => {
      const unsubscribe = originalSubscribe(storeKey, callback);
      return () => {
        unsubscribe();
        throw new Error('unsubscribe');
      };
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mounted = mount(undefined, key, store);
    const native = vi.spyOn(mounted.grid, 'beginUpdate').mockImplementation(() => {
      throw new Error('native programming error');
    });
    expect(() => mounted.store.setItem(key, saved)).toThrow('native programming error');
    expect(warn).not.toHaveBeenCalled();
    native.mockRestore();
    mounted.unmount();
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('Store unsubscribe failed')
    );
  });

  it('subscribes before reading and never owns Store setup or teardown', () => {
    const store = memoryStore();
    const setup = vi.spyOn(store, 'setup');
    const teardown = vi.spyOn(store, 'teardown');
    const mounted = mount(undefined, key, store);
    expect(mounted.subscribe.mock.invocationCallOrder[0]).toBeLessThan(
      mounted.read.mock.invocationCallOrder[0]!
    );
    expect(setup).toHaveBeenCalledOnce();
    mounted.unmount();
    expect(teardown).toHaveBeenCalledOnce();
  });

  it('works under StrictMode without redundant subscriptions or initial writes', async () => {
    const mounted = mount(saved, key, undefined, true);
    expect(mounted.grid.columnOption(1, 'width')).toBe(180);
    mounted.change('width', 208);
    await tick();
    expect(mounted.write).toHaveBeenCalledOnce();
  });

  it('waits for configured columns before restoring', () => {
    const store = memoryStore({ [key]: saved });
    const hook = renderHook(() => useGridLayoutPersistence<Row>(key), {
      wrapper: ({ children }) => (
        <StoreContextProvider value={store}>{children}</StoreContextProvider>
      ),
    });
    const handlers: Handlers = hook.result.current;
    const host = document.createElement('div');
    const grid: Grid = new DataGrid<Row, number>(host, { dataSource: [], columns: [] });
    act(() => handlers.handleLayoutContentReady({ component: grid, element: host }));
    act(() => grid.option('columns', [{ dataField: 'id' }, { dataField: 'a' }]));
    act(() => handlers.handleLayoutContentReady({ component: grid, element: host }));
    expect(grid.columnOption(1, 'width')).toBe(180);
    grid.dispose();
    hook.unmount();
  });
});
