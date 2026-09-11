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

  it('normalizes fresh ordered summary objects without changing selectors or inputs', () => {
    const items = Object.freeze([
      Object.freeze({ selector: 'age', summaryType: 'max' }),
      Object.freeze({ selector: 'id', summaryType: 'count' }),
      Object.freeze({ selector: 'age', summaryType: 'avg' }),
      Object.freeze({ selector: 'age', summaryType: 'min' }),
      Object.freeze({ selector: 'age', summaryType: 'max' }),
      Object.freeze({ summaryType: 'count', selector: undefined }),
    ]);
    const result = normalizeLoadOptions({ totalSummary: items } as unknown as LoadOptions);
    expect(result.totalSummary).toEqual([...items.slice(0, -1), { summaryType: 'count' }]);
    expect(result.totalSummary).not.toBe(items);
    expect(result.totalSummary?.[0]).not.toBe(items[0]);
    expect(items[5]).toHaveProperty('selector');
    for (const selector of ['age; DROP TABLE customer', '__dict__', 'customer.age', ' age ']) {
      expect(normalizeLoadOptions({ totalSummary: { selector, summaryType: 'sum' } })).toEqual({
        totalSummary: [{ selector, summaryType: 'sum' }],
      });
    }
  });

  it.each([undefined, null, []])('omits inactive summaries %j', (totalSummary) => {
    expect(normalizeLoadOptions({ totalSummary } as LoadOptions)).toEqual({});
  });

  it.each([
    '',
    'age',
    1,
    false,
    {},
    new Date(),
    [null],
    [undefined],
    new Array(1),
    [['age']],
    { selector: 'age' },
    { selector: 'age', summaryType: 'custom' },
    { selector: 'age', summaryType: 'SUM' },
    { summaryType: 'avg' },
    { selector: undefined, summaryType: 'min' },
    { selector: null, summaryType: 'count' },
    { selector: '', summaryType: 'count' },
    { selector: '  ', summaryType: 'sum' },
    { selector: 1, summaryType: 'count' },
    { selector: () => 1, summaryType: 'count' },
    { selector: 'age', summaryType: () => 'sum' },
    { selector: 'age', summaryType: 'sum', extra: true },
    { summaryType: 'count', calculateCustomSummary: () => 1 },
    { summaryType: 'count', [Symbol('extra')]: true },
  ])('rejects malformed summaries %j', (totalSummary) => {
    expect(() => normalizeLoadOptions({ totalSummary } as LoadOptions)).toThrow(/totalSummary/);
  });

  it('bounds summary expressions including duplicates at 32', () => {
    const totalSummary = Array.from({ length: 32 }, () => ({ summaryType: 'count' as const }));
    expect(
      normalizeLoadOptions({ totalSummary } as unknown as LoadOptions).totalSummary
    ).toHaveLength(32);
    expect(() =>
      normalizeLoadOptions({
        totalSummary: [...totalSummary, totalSummary[0]],
      } as unknown as LoadOptions)
    ).toThrow(/32/);
  });
});
