import { describe, expect, it, vi } from 'vitest';
import type { LoadOptions } from 'devextreme/common/data';
import { testDataProvider } from 'react-admin';
import { createGridStore } from '../src/remote/createGridStore';

const groupAtDepth = (depth: number, isExpanded = false) =>
  Array.from({ length: depth }, (_, index) => ({
    selector: `field${index}`,
    desc: index % 2 === 0,
    isExpanded: index < depth - 1 || isExpanded,
  }));

const makeStore = (result: unknown) => {
  const getGrid = vi.fn().mockResolvedValue(result);
  return {
    getGrid,
    store: createGridStore({
      resource: 'customers',
      dataProvider: { ...testDataProvider(), getGrid },
    }),
  };
};

const load = (result: unknown, options: unknown) =>
  Promise.resolve(makeStore(result).store.load(options as LoadOptions));

describe('complete remote group results', () => {
  it.each([1, 2, 3, 4])(
    'preserves a complete depth-%i tree and final expansion flags',
    async (depth) => {
      const summary = [0, null, -3, 2.75, '2026-01-01', true, false, 0];
      const groupSummary = summary.map(() => ({ summaryType: 'count' }));
      let data: unknown[] = [{ id: 0 }, { id: 'b' }];
      for (let index = 0; index < depth; index++)
        data = [{ key: `level${index}`, items: data, summary }];
      for (const isExpanded of [false, true]) {
        const result = { data, totalCount: 2, groupCount: 1, summary: [2, null] };
        const { store, getGrid } = makeStore(result);
        const loadOptions = {
          group: groupAtDepth(depth, isExpanded),
          groupSummary,
          totalSummary: [{ summaryType: 'count' }, { selector: 'age', summaryType: 'avg' }],
          requireGroupCount: true,
          requireTotalCount: true,
          sort: [{ selector: 'id', desc: true }],
          filter: ['active', '=', false],
        };
        const loaded = await store.load(loadOptions as unknown as LoadOptions);
        expect(loaded).toEqual(result);
        expect(loaded).toHaveProperty('data', data);
        expect(getGrid).toHaveBeenCalledExactlyOnceWith('customers', { loadOptions });
      }
    }
  );

  it.each([null, '', 'UK', 'uk', '2026-01-01', 0, -2, 1.25, false, true])(
    'accepts JSON scalar keys without coercion %j',
    async (key) => {
      const result = { data: [{ key, items: [{ id: 'a' }] }] };
      expect(await load(result, { group: groupAtDepth(1) })).toEqual(result);
    }
  );

  it('accepts empty complete trees and independent explicit counts', async () => {
    for (const depth of [1, 4]) {
      expect(
        await load(
          { data: [], groupCount: 0, totalCount: 0 },
          {
            group: groupAtDepth(depth),
            requireGroupCount: true,
            requireTotalCount: true,
            groupSummary: [{ summaryType: 'count' }],
          }
        )
      ).toEqual({ data: [], groupCount: 0, totalCount: 0 });
      expect(
        await load({ data: [{ key: null, items: [] }] }, { group: groupAtDepth(depth) })
      ).toEqual({ data: [{ key: null, items: [] }] });
    }
    expect(
      await load({ data: [], totalCount: 1.5 }, { group: groupAtDepth(1), requireTotalCount: true })
    ).toEqual({ data: [], totalCount: 1.5 });
  });

  it('uses requested depth, never key/items fields, to distinguish records from groups', async () => {
    const record = { id: 1, key: { arbitrary: true }, items: null, summary: ['record field'] };
    expect(await load({ data: [record] }, {})).toEqual({ data: [record] });
    const result = { data: [{ key: 'US', items: [record] }] };
    expect(await load(result, { group: groupAtDepth(1) })).toEqual(result);
    await expect(load(result, { group: groupAtDepth(2) })).rejects.toThrow(/group/);
  });

  it.each([
    undefined,
    NaN,
    Infinity,
    -Infinity,
    {},
    [],
    new Date(),
    () => 1,
    Symbol('key'),
    BigInt(1),
  ])('rejects invalid group keys %# at every requested level', async (key) => {
    await expect(load({ data: [{ key, items: [] }] }, { group: groupAtDepth(1) })).rejects.toThrow(
      /key/
    );
    await expect(
      load({ data: [{ key: 'parent', items: [{ key, items: [] }] }] }, { group: groupAtDepth(2) })
    ).rejects.toThrow(/key/);
  });

  it.each([undefined, null, {}, 'items', 1, () => [], new Array(1)])(
    'rejects non-array or sparse items %# including collapsed native nodes',
    async (items) => {
      for (const depth of [1, 2]) {
        await expect(
          load({ data: [{ key: 'US', items, count: 3 }] }, { group: groupAtDepth(depth) })
        ).rejects.toThrow(/items|dense/);
      }
    }
  );

  it.each([null, undefined, [], {}, 'group', 1, new Date(), { id: 1 }])(
    'rejects malformed group nodes %#',
    async (node) => {
      await expect(load({ data: [node] }, { group: groupAtDepth(1) })).rejects.toThrow(/group/);
    }
  );

  it('rejects wrong depths and mixed siblings instead of guessing tree shape', async () => {
    const tree = { key: 'US', items: [{ key: 'Boston', items: [{ id: 1 }] }] };
    for (const depth of [0, 1, 3]) {
      await expect(
        load({ data: [tree] }, { group: depth ? groupAtDepth(depth) : undefined })
      ).rejects.toThrow(/group|record/);
    }
    await expect(
      load({ data: [{ key: 'US', items: [{ id: 1 }] }, { id: 2 }] }, { group: groupAtDepth(1) })
    ).rejects.toThrow(/group/);
    await expect(
      load(
        { data: [{ key: 'US', items: [{ id: 1 }, { key: 'Boston', items: [] }] }] },
        { group: groupAtDepth(1) }
      )
    ).rejects.toThrow(/record/);
  });

  it.each([
    null,
    undefined,
    {},
    [],
    'record',
    1,
    new Date(),
    { id: null },
    { id: undefined },
    { id: false },
    { id: NaN },
    { id: Infinity },
    { id: {} },
    { id: [] },
    { id: () => 1 },
    { id: BigInt(1) },
    { id: Symbol('id') },
  ])('rejects invalid canonical records %# in flat and grouped leaves', async (record) => {
    await expect(load({ data: [record] }, {})).rejects.toThrow(/record.*id/);
    await expect(
      load({ data: [{ key: 'US', items: [record] }] }, { group: groupAtDepth(1) })
    ).rejects.toThrow(/record.*id/);
  });

  it('rejects sparse top-level and nested arrays even when prototype values fill holes', async () => {
    for (const group of [undefined, groupAtDepth(1)]) {
      await expect(load({ data: new Array(1) }, { group })).rejects.toThrow(/dense/);
    }
    const items = new Array(1);
    const prototype = Object.create(Array.prototype);
    prototype[0] = { id: 1 };
    Object.setPrototypeOf(items, prototype);
    await expect(
      load({ data: [{ key: null, items }] }, { group: groupAtDepth(1) })
    ).rejects.toThrow(/dense/);
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
  )('rejects missing, mismatched or unsafe group summaries %# at all levels', async (summary) => {
    const options = { group: groupAtDepth(2), groupSummary: [{ summaryType: 'count' }] };
    const child = { key: 'Boston', items: [{ id: 1 }], summary: [1] };
    await expect(load({ data: [{ key: 'US', items: [child], summary }] }, options)).rejects.toThrow(
      /group summary/
    );
    await expect(
      load({ data: [{ key: 'US', items: [{ ...child, summary }], summary: [1] }] }, options)
    ).rejects.toThrow(/group summary/);
  });

  it('validates summaries on every sibling and uses independent total/group lengths', async () => {
    const options = {
      group: groupAtDepth(2),
      groupSummary: [{ summaryType: 'count' }, { summaryType: 'count' }],
      totalSummary: [{ summaryType: 'count' }],
    };
    const child = { key: 'Boston', items: [{ id: 1 }], summary: [1, 1] };
    const parent = { key: 'US', items: [child], summary: [1, 1] };
    expect(await load({ data: [parent], summary: [1] }, options)).toEqual({
      data: [parent],
      summary: [1],
    });
    await expect(
      load({ data: [parent, { ...parent, summary: [1] }], summary: [1] }, options)
    ).rejects.toThrow(/group summary/);
    await expect(
      load(
        { data: [{ ...parent, items: [child, { ...child, summary: [1] }] }], summary: [1] },
        options
      )
    ).rejects.toThrow(/group summary/);
    await expect(load({ data: [parent], summary: [1, 1] }, options)).rejects.toThrow(/summary/);
  });

  it.each([null, [], [1], {}])(
    'rejects unsolicited group summary %j at every level',
    async (summary) => {
      await expect(
        load({ data: [{ key: 'US', items: [], summary }] }, { group: groupAtDepth(1) })
      ).rejects.toThrow(/unsolicited group summary/);
      await expect(
        load(
          { data: [{ key: 'US', items: [{ key: 'Boston', items: [], summary }] }] },
          { group: groupAtDepth(2) }
        )
      ).rejects.toThrow(/unsolicited group summary/);
    }
  );

  it.each([undefined, null, -1, 1.5, NaN, Infinity, '1', false])(
    'rejects invalid requested groupCount %#',
    async (groupCount) => {
      await expect(
        load({ data: [], groupCount }, { group: groupAtDepth(1), requireGroupCount: true })
      ).rejects.toThrow(/groupCount/);
    }
  );

  it.each([null, 0, 1, 1.5, '1', false])(
    'rejects unsolicited groupCount %# for flat and grouped requests',
    async (groupCount) => {
      for (const group of [undefined, groupAtDepth(1)]) {
        for (const requireGroupCount of [undefined, false]) {
          await expect(
            load({ data: [], groupCount }, { group, requireGroupCount })
          ).rejects.toThrow(/unsolicited groupCount/);
        }
      }
    }
  );

  it('omits undefined optional groupCount and accepts absent inactive group summaries', async () => {
    const data = [{ key: null, items: [], summary: undefined }];
    expect(
      await load({ data, groupCount: undefined }, { group: groupAtDepth(1), groupSummary: [] })
    ).toEqual({ data });
  });

  it.each([
    { group: 'country' },
    { group: [{ selector: 'country', desc: false, isExpanded: false, groupInterval: 'year' }] },
    { group: groupAtDepth(1), skip: 0 },
    { group: groupAtDepth(1), take: 0 },
    { group: groupAtDepth(5) },
    { group: [...groupAtDepth(1), ...groupAtDepth(1)] },
    { groupSummary: [{ summaryType: 'count' }] },
    { requireGroupCount: true },
    { requireGroupCount: 'true' },
  ])('rejects unsupported grouping before calling getGrid %#', async (options) => {
    const { store, getGrid } = makeStore({ data: [] });
    await expect(Promise.resolve(store.load(options as LoadOptions))).rejects.toThrow(
      /DatagridDXRemote/
    );
    expect(getGrid).not.toHaveBeenCalled();
  });

  it('preserves grouped synchronous and asynchronous provider errors', async () => {
    const error = new Error('offline');
    for (const getGrid of [
      vi.fn().mockRejectedValue(error),
      vi.fn(() => {
        throw error;
      }),
    ]) {
      const store = createGridStore({
        resource: 'customers',
        dataProvider: { ...testDataProvider(), getGrid },
      });
      await expect(Promise.resolve(store.load({ group: groupAtDepth(1) }))).rejects.toBe(error);
    }
  });
});
