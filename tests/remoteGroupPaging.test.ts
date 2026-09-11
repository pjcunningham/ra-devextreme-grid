import { describe, expect, it, vi } from 'vitest';
import type { LoadOptions } from 'devextreme/common/data';
import { testDataProvider } from 'react-admin';
import { createGridStore } from '../src/remote/createGridStore';
import { normalizeLoadOptions } from '../src/remote/loadOptions';
import type { GetGridGroupPagingContext } from '../src';

const country = { selector: 'country', desc: false, isExpanded: false };
const company = { selector: 'company', desc: true, isExpanded: false };
const context: GetGridGroupPagingContext = {
  group: [country, company],
  filter: ['active', '=', true],
};
const capabilities = { groupPaging: true, groupPagingContext: context };
const normalize = (options: unknown) => normalizeLoadOptions(options as LoadOptions, capabilities);
function load(result: unknown, options: unknown = { group: [country], skip: 0, take: 3 }) {
  const getGrid = vi.fn().mockResolvedValue(result);
  const store = createGridStore({
    resource: 'customers',
    dataProvider: { ...testDataProvider(), getGrid },
    groupPaging: true,
    getGroupPagingContext: () => context,
  });
  return Promise.resolve(store.load(options as LoadOptions));
}

describe('group paging normalization', () => {
  it('preserves native root, child, rank/count and independent leaf requests', () => {
    const requests = [
      { group: [country], skip: 0, take: 3, requireGroupCount: true, requireTotalCount: true },
      {
        group: [company],
        skip: 0,
        requireGroupCount: true,
        requireTotalCount: false,
        filter: ['country', '=', 'UK'],
      },
      {
        skip: 0,
        take: 1,
        requireGroupCount: false,
        requireTotalCount: true,
        filter: [['country', '=', 'UK'], 'and', ['company', '=', 'Acme']],
      },
      {
        take: 2,
        requireGroupCount: false,
        requireTotalCount: false,
        sort: [country, company],
        groupSummary: [{ selector: 'id', summaryType: 'count' }],
        totalSummary: [{ selector: 'id', summaryType: 'count' }],
      },
      {
        group: [country],
        skip: 0,
        take: 1,
        requireGroupCount: true,
        requireTotalCount: false,
        filter: [['country', '<', 'UK'], 'or', ['country', '=', null]],
      },
    ];
    for (const request of requests)
      expect(normalize(request)).toEqual({ ...request, groupPagingContext: context });
  });
  it.each([0, -1, 101, Infinity, NaN, 1.5, '10', null])('rejects invalid lazy take %s', (take) => {
    expect(() => normalize({ group: [country], skip: 0, take })).toThrow(/take/);
  });
  it.each([-1, Infinity, NaN, 1.5, '10', null])('rejects invalid lazy skip %s', (skip) => {
    expect(() => normalize({ group: [country], skip, take: 3 })).toThrow(/skip/);
  });
  it('rejects expanded, multi-level and unconfigured native group requests', () => {
    for (const group of [
      [{ ...country, isExpanded: true }],
      [country, company],
      [{ ...country, selector: 'foreign' }],
    ]) {
      expect(() => normalize({ group, skip: 0, take: 3 })).toThrow(/group/);
    }
    expect(() =>
      normalizeLoadOptions({ group: [country], take: 3 }, { groupPaging: true })
    ).toThrow(/Context/);
    expect(() => normalizeLoadOptions({}, { groupPagingContext: context })).toThrow(/groupPaging/);
  });
  it('retains strict complete-tree defaults when capability is omitted or false', () => {
    for (const options of [{}, { groupPaging: false }]) {
      expect(() => normalizeLoadOptions({ group: [country], skip: 0 }, options)).toThrow(/skip/);
      expect(() => normalizeLoadOptions({ group: [country, company] }, options)).toThrow(
        /nonfinal/
      );
      expect(normalizeLoadOptions({ group: [country] }, options)).toEqual({ group: [country] });
    }
  });
  it('keeps ordinary flat requests free of group-paging transport fields', () => {
    expect(
      normalizeLoadOptions(
        { skip: 0, take: 10, group: null, requireTotalCount: true } as unknown as LoadOptions,
        { groupPaging: true }
      )
    ).toEqual({ skip: 0, take: 10, requireTotalCount: true });
  });
});

describe('lazy provider result validation', () => {
  it.each([null, 'UK', 'uk', 0, false, '2026-01-01'])(
    'accepts collapsed key %j with full-group count',
    async (key) => {
      const result = { data: [{ key, items: null, count: 12 }] };
      expect(await load(result)).toEqual(result);
    }
  );
  it.each([undefined, null, -1, 1.2, NaN, Infinity, '3', true])(
    'rejects invalid collapsed count %s',
    async (count) => {
      await expect(load({ data: [{ key: 'UK', items: null, count }] })).rejects.toThrow(/count/);
    }
  );
  it('validates expanded arrays at the remaining configured depth', async () => {
    const result = { data: [{ key: 'UK', items: [{ key: 'Acme', items: [{ id: 1 }] }] }] };
    expect(await load(result)).toEqual(result);
    expect(await load({ data: [{ key: 'UK', items: [] }] })).toEqual({
      data: [{ key: 'UK', items: [] }],
    });
    await expect(load({ data: [{ key: 'UK', items: [{ id: 1 }] }] })).rejects.toThrow(/key/);
    await expect(
      load({
        data: [
          { key: 'UK', items: [{ key: 'Acme', items: [{ key: 'wrong', items: null, count: 1 }] }] },
        ],
      })
    ).rejects.toThrow(/id/);
  });
  it('accepts independently requested records without interpreting application items fields', async () => {
    const result = { data: [{ id: 1, items: null, key: 'application' }] };
    expect(
      await load(result, {
        take: 2,
        requireGroupCount: false,
        groupSummary: [{ selector: 'id', summaryType: 'count' }],
      })
    ).toEqual(result);
  });
  it('requires scoped group counts and positional summaries only when requested', async () => {
    const options = {
      group: [company],
      skip: 0,
      take: 1,
      requireGroupCount: true,
      groupSummary: [{ selector: 'id', summaryType: 'count' }],
    };
    const result = {
      data: [{ key: 'Acme', items: null, count: 12, summary: [12] }],
      groupCount: 4,
    };
    expect(await load(result, options)).toEqual(result);
    await expect(load({ ...result, groupCount: undefined }, options)).rejects.toThrow(/groupCount/);
    await expect(
      load({ data: [{ key: 'Acme', items: null, count: 12, summary: [] }], groupCount: 4 }, options)
    ).rejects.toThrow(/summary/);
  });
  it('preserves original provider error identity', async () => {
    const error = new Error('provider unavailable');
    const store = createGridStore({
      resource: 'customers',
      groupPaging: true,
      getGroupPagingContext: () => context,
      dataProvider: { ...testDataProvider(), getGrid: vi.fn().mockRejectedValue(error) },
    });
    await expect(Promise.resolve(store.load({ group: [country], skip: 0, take: 3 }))).rejects.toBe(
      error
    );
  });
});
