import { describe, expect, it, vi } from 'vitest';
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

  it('rejects advanced load requests before the provider runs', async () => {
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
});
