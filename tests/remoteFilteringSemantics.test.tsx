import { describe, it, expect, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import ArrayStore from 'devextreme/data/array_store';
import CustomStore from 'devextreme/data/custom_store';
import DataGrid, { Column, type DataGridRef } from 'devextreme-react/data-grid';
import type { LoadOptions } from 'devextreme/common/data';
import { normalizeLoadOptions } from '../src/remote/loadOptions';

interface Customer {
  id: number;
  name: string;
  age: number | null;
  active: boolean;
  country: string;
}

const customers: Customer[] = [
  { id: 1, name: 'Smith', age: null, active: true, country: 'UK' },
  { id: 2, name: 'SMITH', age: 30, active: false, country: 'UK' },
  { id: 3, name: 'Jones', age: 40, active: true, country: 'France' },
  { id: 4, name: 'sm%_ith', age: 20, active: false, country: 'USA' },
];

async function matchingIds(filter: unknown[], data = customers) {
  const store = new ArrayStore<Customer, number>({ key: 'id', data });
  const result = await store.load({ filter });
  expect(Array.isArray(result)).toBe(true);
  return (result as Customer[]).map((row) => row.id);
}

describe('DevExtreme 26.1.4 public ArrayStore filter semantics', () => {
  it.each<[string, string, number[]]>([
    ['=', 'sMiTh', [1, 2]],
    ['<>', 'sMiTh', [3, 4]],
    ['contains', 'MiT', [1, 2]],
    ['notcontains', 'MiT', [3, 4]],
    ['startswith', 'SM', [1, 2, 4]],
    ['endswith', 'ITH', [1, 2, 4]],
    ['contains', '%_', [4]],
    ['notcontains', '%_', [1, 2, 3]],
    ['startswith', 'sm%', [4]],
    ['endswith', '_ith', [4]],
  ])('evaluates name %s %s case-insensitively with literal wildcards', async (op, value, ids) => {
    expect(await matchingIds(['name', op, value])).toEqual(ids);
  });

  it.each<[unknown[], number[]]>([
    [['age', '=', 30], [2]],
    [['age', '>', 30], [3]],
    [
      ['age', '>=', 30],
      [2, 3],
    ],
    [['age', '<', 30], [4]],
    [
      ['age', '<=', 30],
      [2, 4],
    ],
    [
      ['active', '=', true],
      [1, 3],
    ],
    [
      ['active', '<>', true],
      [2, 4],
    ],
    [['age', '=', null], [1]],
    [
      ['age', '<>', null],
      [2, 3, 4],
    ],
    [['age', null], [1]],
  ])('evaluates typed and null condition %j', async (filter, ids) => {
    expect(await matchingIds(filter)).toEqual(ids);
  });

  it.each<[unknown[], number[], number[]]>([
    [
      ['age', '<>', 30],
      [1, 3, 4],
      [3, 4],
    ],
    [
      ['!', ['age', '=', 30]],
      [1, 3, 4],
      [3, 4],
    ],
    [
      ['!', ['age', '>', 30]],
      [1, 2, 4],
      [2, 4],
    ],
  ])(
    'records local nullable behavior for %j, unlike SQL UNKNOWN',
    async (filter, localIds, sqlIds) => {
      // SQL three-valued logic excludes NULL here; ArrayStore's boolean negation includes it.
      expect(await matchingIds(filter)).toEqual(localIds);
      expect(localIds.filter((id) => id !== 1)).toEqual(sqlIds);
      expect(localIds).not.toEqual(sqlIds);
    }
  );

  it.each<[unknown[], number[]]>([
    [
      ['country', 'UK'],
      [1, 2],
    ],
    [
      ['active', true],
      [1, 3],
    ],
    [['country', '='], []],
    [
      [
        ['country', 'UK'],
        ['active', true],
      ],
      [1],
    ],
    [[['country', 'UK'], 'and', ['active', true]], [1]],
    [
      [['country', 'UK'], 'or', [['age', '>=', 30], 'and', ['active', true]]],
      [1, 2, 3],
    ],
    [
      ['!', ['country', 'UK']],
      [3, 4],
    ],
    [['!', [['country', 'UK'], 'or', ['active', true]]], [4]],
    [
      ['!', ['!', ['country', 'UK']]],
      [1, 2],
    ],
  ])('evaluates shorthand, implicit AND, and nested/NOT expression %j', async (filter, ids) => {
    expect(await matchingIds(filter)).toEqual(ids);
  });

  it('treats an operator-looking shorthand value as literal equality', async () => {
    const literal = { ...customers[0]!, id: 5, country: '=' };
    expect(await matchingIds(['country', '='], [...customers, literal])).toEqual([5]);
  });

  it.each<[unknown[], string]>([
    [[['country', 'UK'], 'and', ['active', true], 'or', ['age', '>=', 30]], 'E4019'],
    [['age', 'between', [20, 40]], 'E4003'],
  ])('rejects unsupported local expression %j with %s', async (filter, code) => {
    // The async boundary handles both a synchronous compiler throw and a rejected load.
    await expect(matchingIds(filter)).rejects.toThrow(new RegExp(code));
  });
});

// Copy expression items at load time, before DevExtreme can mutate Date operands.
// Local components avoid making the evidence depend on the machine's time zone.
function snapshotFilter(value: unknown): unknown {
  if (value instanceof Date) {
    return Object.freeze({
      date: Object.freeze([
        value.getFullYear(),
        value.getMonth() + 1,
        value.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds(),
      ]),
    });
  }
  if (Array.isArray(value)) return Object.freeze(value.map(snapshotFilter));
  return value;
}

function day(dayOfMonth: number) {
  return { date: [2024, 1, dayOfMonth, 0, 0, 0, 0] };
}

function mountProcessedGrid() {
  const evidence: { filter: unknown; preservesReference: boolean }[] = [];
  const load = vi.fn(async (options: LoadOptions<Customer>) => {
    const normalized = normalizeLoadOptions(options);
    evidence.push({
      filter: snapshotFilter(options.filter),
      preservesReference: normalized.filter === options.filter,
    });
    // Deliberately return a processed page unchanged to detect accidental local filtering.
    return { data: customers.map((row) => ({ ...row })), totalCount: customers.length };
  });
  const store = new CustomStore<Customer, number>({ key: 'id', loadMode: 'processed', load });
  const ref = createRef<DataGridRef<Customer, number>>();
  const onDataErrorOccurred = vi.fn();
  const view = render(
    <DataGrid<Customer, number>
      ref={ref}
      dataSource={store}
      remoteOperations={{ filtering: true, sorting: true, paging: true }}
      paging={{ pageSize: 20 }}
      filterRow={{ visible: true, applyFilter: 'auto' }}
      onDataErrorOccurred={onDataErrorOccurred}
    >
      <Column dataField="id" dataType="number" />
      <Column dataField="name" dataType="string" />
      <Column dataField="age" dataType="number" />
      <Column dataField="active" dataType="boolean" />
      <Column dataField="country" dataType="string" />
      <Column dataField="joined_on" dataType="date" />
    </DataGrid>
  );
  const grid = () => ref.current!.instance();
  return {
    async ready() {
      await waitFor(() => {
        expect(load).toHaveBeenCalled();
        expect(grid().getDataSource().isLoading()).toBe(false);
        expect(
          grid()
            .getVisibleRows()
            .filter((row) => row.rowType === 'data')
        ).toHaveLength(4);
      });
    },
    async filter(field: string, operation: string, value: unknown) {
      const calls = load.mock.calls.length;
      act(() => {
        grid().columnOption(field, { selectedFilterOperation: operation, filterValue: value });
      });
      await waitFor(() => {
        expect(load.mock.calls.length).toBeGreaterThan(calls);
        expect(grid().getDataSource().isLoading()).toBe(false);
      });
      expect(onDataErrorOccurred).not.toHaveBeenCalled();
      expect(grid().getDataSource().store()).toBe(store);
      expect(
        grid()
          .getVisibleRows()
          .filter((row) => row.rowType === 'data')
          .map((row) => row.key)
      ).toEqual([1, 2, 3, 4]);
      expect(grid().totalCount()).toBe(4);
      const requests = evidence.slice(calls);
      expect(requests.every((request) => request.preservesReference)).toBe(true);
      return requests.map((request) => request.filter);
    },
    unmount: view.unmount,
  };
}

describe('DevExtreme 26.1.4 native Filter Row processed CustomStore requests', () => {
  it.each<[string, string, unknown, unknown[]]>([
    ['age', '>=', 30, ['age', '>=', 30]],
    ['active', '=', true, ['active', '=', true]],
    ['age', 'between', [20, 40], [['age', '>=', 20], 'and', ['age', '<=', 40]]],
  ])(
    'preserves typed %s %s operands and expands numeric between',
    async (field, operation, value, expected) => {
      const harness = mountProcessedGrid();
      try {
        await harness.ready();
        const requests = await harness.filter(field, operation, value);
        for (const filter of requests) expect(filter).toEqual(expected);
      } finally {
        harness.unmount();
      }
    }
  );

  it.each<[string, unknown[]]>([
    ['=', [['joined_on', '>=', day(15)], 'and', ['joined_on', '<', day(16)]]],
    ['<>', [['joined_on', '<', day(15)], 'or', ['joined_on', '>=', day(16)]]],
    ['>', ['joined_on', '>=', day(16)]],
    ['>=', ['joined_on', '>=', day(15)]],
    ['<', ['joined_on', '<', day(15)]],
    ['<=', ['joined_on', '<', day(16)]],
    ['between', [['joined_on', '>=', day(15)], 'and', ['joined_on', '<', day(18)]]],
  ])(
    'emits native Date day ranges for joined_on %s and preserves the filter reference',
    async (operation, expected) => {
      // A new grid and new Date objects per operation prevent cross-operation mutation.
      const harness = mountProcessedGrid();
      try {
        await harness.ready();
        const value =
          operation === 'between'
            ? [new Date(2024, 0, 15), new Date(2024, 0, 17)]
            : new Date(2024, 0, 15);
        const requests = await harness.filter('joined_on', operation, value);
        for (const filter of requests) expect(filter).toEqual(expected);
      } finally {
        harness.unmount();
      }
    }
  );
});
