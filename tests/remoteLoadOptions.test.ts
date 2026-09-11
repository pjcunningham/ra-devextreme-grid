import { describe, expect, expectTypeOf, it } from 'vitest';
import type { LoadOptions } from 'devextreme/common/data';
import { normalizeLoadOptions } from '../src/remote/loadOptions';
import type {
  DatagridDXDataProvider,
  GetGridResult,
  GetGridSortDescriptor,
} from '../src/remote/types';

describe('remote load options', () => {
  it('preserves native zero/false paging without bookkeeping', () => {
    expect(
      normalizeLoadOptions({
        skip: 0,
        take: 0,
        requireTotalCount: false,
        userData: { fn: () => 1 },
      })
    ).toEqual({ skip: 0, take: 0, requireTotalCount: false });
    expect(normalizeLoadOptions({})).toEqual({});
  });

  it.each([
    ['name', [{ selector: 'name', desc: false }]],
    [{ selector: 'id' }, [{ selector: 'id', desc: false }]],
    [
      ['country', { selector: 'name', desc: true }],
      [
        { selector: 'country', desc: false },
        { selector: 'name', desc: true },
      ],
    ],
  ])('normalizes ordered sort %j', (sort, expected) => {
    expect(normalizeLoadOptions({ sort } as LoadOptions).sort).toEqual(expected);
  });

  it('preserves nested AND/OR/NOT, objects, Dates and cycles without suffix conversion', () => {
    const date = new Date('2026-01-01');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const filter = [
      ['name', 'contains', 'smith'],
      'and',
      ['!', [['date', '>=', date], 'or', ['value', '=', { cyclic }]]],
    ];
    expect(normalizeLoadOptions({ filter }).filter).toBe(filter);
    expect((filter[2] as unknown[])[1]).toEqual([
      ['date', '>=', date],
      'or',
      ['value', '=', { cyclic }],
    ]);
    expect(normalizeLoadOptions({ filter: null })).toEqual({ filter: null });
  });

  it.each([
    { sort: () => 1 },
    { sort: { selector: () => 1 } },
    { filter: ['x', '=', { nested: [() => 1] }] },
    { skip: () => 1 },
  ])('rejects executable input %j', (options) => {
    expect(() => normalizeLoadOptions(options as LoadOptions)).toThrow(/executable functions/);
  });

  it.each([null, 3, '', {}, { selector: 3 }, { selector: 'id', desc: 'DESC' }, ['id']])(
    'rejects malformed sort item %j',
    (item) => {
      expect(() => normalizeLoadOptions({ sort: [item] } as LoadOptions)).toThrow(/sort requires/);
    }
  );

  it.each([
    'group',
    'groupSummary',
    'totalSummary',
    'requireGroupCount',
    'select',
    'expand',
    'parentIds',
    'customQueryParams',
    'startDate',
    'endDate',
  ])('rejects active %s', (field) => {
    expect(() =>
      normalizeLoadOptions({ [field]: field === 'requireGroupCount' ? true : ['id'] })
    ).toThrow(field);
  });

  it('tolerates inactive advanced and native search defaults', () => {
    expect(
      normalizeLoadOptions({
        group: [],
        groupSummary: null,
        totalSummary: [],
        requireGroupCount: false,
        searchExpr: null,
        searchValue: null,
        searchOperation: 'contains',
        select: [],
      } as unknown as LoadOptions)
    ).toEqual({});
  });

  it.each([
    { searchValue: 0 },
    { searchValue: false },
    { searchExpr: 'name' },
    { searchOperation: '=' },
  ])('rejects active search %j', (options) => {
    expect(() => normalizeLoadOptions(options as LoadOptions)).toThrow(/search inputs/);
  });

  it.each([
    { skip: -1 },
    { take: Infinity },
    { take: 1.5 },
    { requireTotalCount: 'yes' },
    { filter: {} },
  ])('rejects invalid supported value %j', (options) => {
    expect(() => normalizeLoadOptions(options as LoadOptions)).toThrow(/DatagridDXRemote/);
  });

  it('keeps the provider result generic and selectors string-only', () => {
    expectTypeOf<GetGridSortDescriptor['selector']>().toEqualTypeOf<string>();
    type Customer = { id: number; name: string };
    const check = (provider: DatagridDXDataProvider) => {
      expectTypeOf(provider.getGrid<Customer>).returns.toEqualTypeOf<
        Promise<GetGridResult<Customer>>
      >();
    };
    expectTypeOf(check).toBeFunction();
  });
});
