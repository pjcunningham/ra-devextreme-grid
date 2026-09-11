import { describe, expect, it, vi } from 'vitest';
import type { LoadOptions } from 'devextreme/common/data';
import { renderHook } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { AdminContext, testDataProvider, useDataProvider } from 'react-admin';
import { createGridStore } from '../src/remote/createGridStore';
import type { DatagridDXDataProvider } from '../src/remote/types';

const makeStore = (getGrid = vi.fn().mockResolvedValue({ data: [], totalCount: 0 })) => ({
  getGrid,
  store: createGridStore({
    resource: 'customers',
    dataProvider: { ...testDataProvider(), getGrid },
  }),
});

describe('processed grid store', () => {
  it('maps exact resource/params and trusts the processed server page', async () => {
    const data = [{ id: 'b' }, { id: 'a' }];
    const { store, getGrid } = makeStore(vi.fn().mockResolvedValue({ data, totalCount: 40 }));
    const loadOptions = {
      skip: 10,
      take: 2,
      sort: [{ selector: 'id', desc: false }],
      requireTotalCount: true,
    };
    expect(store.key()).toBe('id');
    expect(await store.load(loadOptions)).toEqual({ data, totalCount: 40 });
    expect(getGrid).toHaveBeenCalledWith('customers', { loadOptions });
  });

  it('declares key "id" and resolves both string and numeric record identifiers', () => {
    const { store } = makeStore();
    expect(store.key()).toBe('id');
    expect(store.keyOf({ id: 'customer-1' })).toBe('customer-1');
    expect(store.keyOf({ id: 101 })).toBe(101);
  });

  it('omits absent optional count and accepts a real zero count', async () => {
    expect(await makeStore(vi.fn().mockResolvedValue({ data: [] })).store.load({})).toEqual({
      data: [],
    });
    expect(await makeStore().store.load({ requireTotalCount: true })).toEqual({
      data: [],
      totalCount: 0,
    });
  });

  it.each([undefined, null, [], {}, { data: null }, { data: {} }])(
    'rejects malformed result %j',
    async (result) => {
      await expect(
        Promise.resolve(makeStore(vi.fn().mockResolvedValue(result)).store.load({}))
      ).rejects.toThrow(/data array/);
    }
  );

  it.each([undefined, null, -1, NaN, Infinity, '10'])(
    'rejects invalid required count %j',
    async (totalCount) => {
      await expect(
        Promise.resolve(
          makeStore(vi.fn().mockResolvedValue({ data: [], totalCount })).store.load({
            requireTotalCount: true,
          })
        )
      ).rejects.toThrow(/totalCount/);
    }
  );

  it.each([null, -1, NaN, Infinity, '10'])('validates optional count %j', async (totalCount) => {
    await expect(
      Promise.resolve(makeStore(vi.fn().mockResolvedValue({ data: [], totalCount })).store.load({}))
    ).rejects.toThrow(/totalCount/);
  });

  it('preserves provider rejection identity', async () => {
    const error = new Error('offline');
    await expect(
      Promise.resolve(makeStore(vi.fn().mockRejectedValue(error)).store.load({}))
    ).rejects.toBe(error);
  });

  it('rejects shorthand grouping before the provider runs', async () => {
    const { store, getGrid } = makeStore();
    await expect(Promise.resolve(store.load({ group: 'country' }))).rejects.toThrow(/group/);
    expect(getGrid).not.toHaveBeenCalled();
  });

  it.each([{}, { getGrid: undefined }, { getGrid: 42 }])(
    'handles missing/misconfigured methods on raw and real wrapped providers %j',
    async (extension) => {
      const provider = { ...testDataProvider(), ...extension } as unknown as DatagridDXDataProvider;
      await expect(
        Promise.resolve(createGridStore({ resource: 'customers', dataProvider: provider }).load({}))
      ).rejects.toThrow(/requires.*getGrid/);
      const wrapper = ({ children }: PropsWithChildren) =>
        createElement(AdminContext, { dataProvider: provider }, children);
      const { result } = renderHook(() => useDataProvider<DatagridDXDataProvider>(), { wrapper });
      await expect(
        Promise.resolve(
          createGridStore({ resource: 'customers', dataProvider: result.current }).load({})
        )
      ).rejects.toThrow(/requires.*getGrid/);
    }
  );

  it('forwards positional JSON scalars unchanged with independent count', async () => {
    const summary = [0, null, -3, 2.75, '2026-01-01', true, false];
    const data = [{ id: 2 }];
    const totalSummary = summary.map(() => ({ summaryType: 'count' as const }));
    for (const requireTotalCount of [undefined, false, true]) {
      const result = { data, summary, ...(requireTotalCount ? { totalCount: 10 } : {}) };
      const { store, getGrid } = makeStore(vi.fn().mockResolvedValue(result));
      const loaded = await store.load({
        totalSummary,
        requireTotalCount,
      } as unknown as LoadOptions);
      expect(loaded).toEqual(result);
      expect(loaded).toHaveProperty('summary', summary);
      expect(getGrid).toHaveBeenCalledWith('customers', {
        loadOptions: {
          totalSummary,
          ...(requireTotalCount !== undefined ? { requireTotalCount } : {}),
        },
      });
    }
  });

  it.each(
    [
      undefined,
      null,
      {},
      '1',
      [],
      [1, 2],
      new Array(1),
      [undefined],
      [NaN],
      [Infinity],
      [-Infinity],
      [() => 1],
      [Symbol('x')],
      [BigInt(1)],
      [new Date()],
      [{}],
      [[]],
    ].map((summary) => [summary])
  )('rejects missing, mismatched or unsafe positional summary %#', async (summary) => {
    const { store } = makeStore(vi.fn().mockResolvedValue({ data: [], summary }));
    await expect(
      Promise.resolve(
        store.load({ totalSummary: [{ summaryType: 'count' }] } as unknown as LoadOptions)
      )
    ).rejects.toThrow(/summary/);
  });

  it.each([null, [], [1], {}])('rejects unsolicited summary %j', async (summary) => {
    const { store } = makeStore(vi.fn().mockResolvedValue({ data: [], summary }));
    await expect(Promise.resolve(store.load({}))).rejects.toThrow(/unsolicited summary/);
  });

  it('omits undefined optional summary and validates before calling the provider', async () => {
    const { store, getGrid } = makeStore(
      vi.fn().mockResolvedValue({ data: [], summary: undefined })
    );
    expect(await store.load({ totalSummary: [] })).toEqual({ data: [] });
    getGrid.mockClear();
    await expect(
      Promise.resolve(
        store.load({ totalSummary: { summaryType: 'custom' } } as unknown as LoadOptions)
      )
    ).rejects.toThrow(/totalSummary/);
    expect(getGrid).not.toHaveBeenCalled();
  });
});
