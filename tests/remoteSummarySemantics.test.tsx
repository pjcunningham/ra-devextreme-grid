import { describe, it, expect, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import ArrayStore from 'devextreme/data/array_store';
import CustomStore from 'devextreme/data/custom_store';
import DataGrid, { Summary, TotalItem, type DataGridRef } from 'devextreme-react/data-grid';
import type { LoadOptions } from 'devextreme/common/data';

interface Customer {
  id: number;
  age: number | null;
  name: string | null;
  active: boolean | null;
  joined_on: Date | null;
}

type GridProps = ComponentProps<typeof DataGrid<Customer, number>>;
type SummaryLoad = (options: LoadOptions<Customer>) => Promise<{
  data: Customer[];
  totalCount?: number;
  summary: number[];
}>;

const summaryTypes = ['count', 'sum', 'avg', 'min', 'max'] as const;
const totalItems = summaryTypes.map((summaryType) => ({
  column: 'age',
  name: summaryType,
  summaryType,
  displayFormat: `${summaryType}: {0}`,
}));
const descriptors = summaryTypes.map((summaryType) => ({ selector: 'age', summaryType }));

function customers(ages: (number | null)[]): Customer[] {
  return ages.map((age, index) => ({
    id: index + 1,
    age,
    name: index === 0 ? null : index === 1 ? '' : `Customer ${index + 1}`,
    active: index === 0 ? null : index % 2 === 0,
    joined_on: index === 0 ? null : new Date(2024, 0, index + 1),
  }));
}

function mountGrid(props: GridProps) {
  const ref = createRef<DataGridRef<Customer, number>>();
  const onContentReady = vi.fn();
  const onDataErrorOccurred = vi.fn();
  const summaryProps = props.children ? {} : { summary: { totalItems } };
  const view = render(
    <DataGrid<Customer, number>
      ref={ref}
      keyExpr={Array.isArray(props.dataSource) ? 'id' : undefined}
      remoteOperations={false}
      defaultPaging={{ pageSize: 2 }}
      columns={[
        { dataField: 'id', dataType: 'number' },
        { dataField: 'age', dataType: 'number' },
        { dataField: 'name', dataType: 'string' },
        { dataField: 'active', dataType: 'boolean' },
        { dataField: 'joined_on', dataType: 'date' },
      ]}
      {...summaryProps}
      onContentReady={onContentReady}
      onDataErrorOccurred={onDataErrorOccurred}
      {...props}
    />
  );
  const grid = () => ref.current!.instance();
  return {
    ...view,
    grid,
    onDataErrorOccurred,
    values: () => summaryTypes.map((name) => grid().getTotalSummaryValue(name)),
    footer: () =>
      Array.from(
        view.container.querySelectorAll('.dx-datagrid-total-footer .dx-datagrid-summary-item')
      ).map((item) => item.textContent?.trim()),
    async ready() {
      await waitFor(() => {
        expect(onContentReady).toHaveBeenCalled();
        expect(grid().getDataSource().isLoading()).toBe(false);
      });
      expect(onDataErrorOccurred).not.toHaveBeenCalled();
    },
    async expectState(ids: number[], values: number[]) {
      await waitFor(() => {
        expect(grid().getDataSource().isLoading()).toBe(false);
        expect(
          grid()
            .getVisibleRows()
            .filter((row) => row.rowType === 'data')
            .map((row) => row.data.id)
        ).toEqual(ids);
        expect(summaryTypes.map((name) => grid().getTotalSummaryValue(name))).toEqual(values);
      });
      expect(onDataErrorOccurred).not.toHaveBeenCalled();
    },
  };
}

const remoteOperations = { filtering: true, sorting: true, paging: true, summary: true };

function mountProcessedGrid(cacheEnabled: boolean) {
  const data = customers([null, 0, 20, 30, 30, 40]);
  const rows = new ArrayStore<Customer, number>({ key: 'id', data });
  const requests: LoadOptions<Customer>[] = [];
  const load = vi.fn(async (options: LoadOptions<Customer>) => {
    requests.push({
      ...options,
      totalSummary: Array.isArray(options.totalSummary)
        ? options.totalSummary.map((item) => (typeof item === 'object' ? { ...item } : item))
        : options.totalSummary,
    });
    // Canned whole-set totals are independent of the returned page and native aggregation.
    const summary = options.filter ? [3, 100, 100 / 3, 30, 40] : [6, 120, 24, 0, 40];
    return {
      data: await rows.load({
        filter: options.filter,
        sort: options.sort,
        skip: options.skip,
        take: options.take,
      }),
      totalCount: options.filter ? 3 : 6,
      ...(options.totalSummary ? { summary } : {}),
    };
  });
  const store = new CustomStore<Customer, number>({ key: 'id', loadMode: 'processed', load });
  const harness = mountGrid({ dataSource: store, remoteOperations, cacheEnabled });
  return {
    ...harness,
    requests,
    async change(action: () => void) {
      const start = requests.length;
      act(() => {
        action();
      });
      await waitFor(() => {
        expect(requests.length).toBeGreaterThan(start);
        expect(harness.grid().getDataSource().isLoading()).toBe(false);
      });
      expect(harness.onDataErrorOccurred).not.toHaveBeenCalled();
      expect(harness.grid().getDataSource().store()).toBe(store);
      return requests.slice(start);
    },
  };
}

describe('DevExtreme 26.1.4 public total summary descriptors', () => {
  it('emits only selector/type keys in item order, retaining duplicates and selector-less count', async () => {
    const items: NonNullable<GridProps['summary']>['totalItems'] = [
      { column: 'id', summaryType: 'count', name: 'rows' },
      ...totalItems,
      { column: 'age', summaryType: 'max', name: 'duplicate', displayFormat: 'Largest {0}' },
      { summaryType: 'count', showInColumn: 'id', name: 'selectorless' },
    ];
    const expected = [
      { selector: 'id', summaryType: 'count' },
      ...descriptors,
      { selector: 'age', summaryType: 'max' },
      { selector: undefined, summaryType: 'count' },
    ];
    const returned = [5, 5, 120, 30, 20, 40, 40, 5];
    const captured: unknown[] = [];
    const store = new CustomStore<Customer, number>({
      key: 'id',
      loadMode: 'processed',
      load: async (options) => {
        captured.push(
          Array.isArray(options.totalSummary)
            ? options.totalSummary.map((item) => (typeof item === 'object' ? { ...item } : item))
            : options.totalSummary
        );
        return { data: customers([null, 20]), totalCount: 5, summary: returned };
      },
    });
    const harness = mountGrid({
      dataSource: store,
      remoteOperations,
      summary: { totalItems: items },
    });
    try {
      await harness.ready();
      expect(captured).toEqual([expected]);
      const raw = captured[0] as Record<string, unknown>[];
      expect(raw.map((item) => Object.keys(item).sort())).toEqual(
        expected.map(() => ['selector', 'summaryType'])
      );
      expect(JSON.parse(JSON.stringify(raw)).at(-1)).toEqual({ summaryType: 'count' });
      expect(items?.map((item) => harness.grid().getTotalSummaryValue(item.name!))).toEqual(
        returned
      );
      expect(harness.grid().option('summary.totalItems')).toEqual(items);
    } finally {
      harness.unmount();
    }
  });

  it.each([
    { totalSummary: { selector: 'age', summaryType: 'sum' }, summary: [20] },
    { totalSummary: { summaryType: 'count' }, summary: [1] },
    {
      totalSummary: [
        { selector: 'age', summaryType: 'max' },
        { summaryType: 'count' },
        { selector: 'age', summaryType: 'max' },
      ],
      summary: [20, 1, 20],
    },
  ])(
    'preserves the direct CustomStore.load form $totalSummary without normalization',
    async ({ totalSummary, summary }) => {
      const result = { data: customers([20]), summary };
      const load = vi.fn<SummaryLoad>(async () => result);
      const store = new CustomStore<Customer, number>({ key: 'id', loadMode: 'processed', load });
      // Native emits selector-less counts even though its descriptor type requires a selector.
      expect(
        await store.load({ totalSummary: totalSummary as LoadOptions<Customer>['totalSummary'] })
      ).toEqual(result);
      expect(load).toHaveBeenCalledWith(expect.objectContaining({ totalSummary }));
      expect(load.mock.calls[0]?.[0]?.totalSummary).toBe(totalSummary);
    }
  );
});

describe('DevExtreme 26.1.4 native local total summary semantics', () => {
  it.each<[string, (number | null)[], number[]]>([
    ['nullable values and duplicates', [null, 20, 30, 30, 40], [5, 120, 30, 20, 40]],
    ['zero is not empty', [null, 0, 20, 30, 30, 40], [6, 120, 24, 0, 40]],
    ['all-null', [null, null], [2, 0, NaN, NaN, NaN]],
    ['single null', [null], [1, 0, NaN, NaN, NaN]],
    ['empty', [], [0, 0, NaN, NaN, NaN]],
  ])('aggregates %s over all rows rather than the visible page', async (_label, ages, expected) => {
    const harness = mountGrid({ dataSource: customers(ages) });
    try {
      await harness.ready();
      expect(harness.values()).toEqual(expected);
      expect(harness.grid().totalCount()).toBe(ages.length);
      if (ages.every((age) => age === null)) {
        expect(harness.footer()).toEqual([`count: ${ages.length}`, 'sum: 0']);
      }
    } finally {
      harness.unmount();
    }
  });

  it('counts rows for numeric, nullable string, Boolean and date selectors, not non-null values', async () => {
    const fields = ['id', 'age', 'name', 'active', 'joined_on'];
    const harness = mountGrid({
      dataSource: customers([null, 20, 30, 30, 40]),
      summary: {
        totalItems: [
          ...fields.map((column) => ({ column, name: column, summaryType: 'count' as const })),
          { name: 'rows', summaryType: 'count', showInColumn: 'id' },
        ],
      },
    });
    try {
      await harness.ready();
      expect([...fields, 'rows'].map((name) => harness.grid().getTotalSummaryValue(name))).toEqual([
        5, 5, 5, 5, 5, 5,
      ]);
    } finally {
      harness.unmount();
    }
  });

  it('recalculates for filters but not page size, page index or multi-column sort', async () => {
    const harness = mountGrid({ dataSource: customers([null, 0, 20, 30, 30, 40]) });
    try {
      await harness.ready();
      await harness.expectState([1, 2], [6, 120, 24, 0, 40]);
      act(() => {
        harness.grid().pageSize(1);
      });
      await harness.expectState([1], [6, 120, 24, 0, 40]);
      act(() => {
        void harness.grid().pageIndex(2);
      });
      await harness.expectState([3], [6, 120, 24, 0, 40]);
      act(() => {
        harness.grid().filter(['id', '>', 3]);
      });
      await harness.expectState([4], [3, 100, 100 / 3, 30, 40]);
      act(() => {
        harness.grid().beginUpdate();
        harness.grid().columnOption('age', { sortOrder: 'desc', sortIndex: 0 });
        harness.grid().columnOption('id', { sortOrder: 'desc', sortIndex: 1 });
        harness.grid().endUpdate();
      });
      await harness.expectState([6], [3, 100, 100 / 3, 30, 40]);
      act(() => {
        void harness.grid().pageIndex(1);
      });
      await harness.expectState([5], [3, 100, 100 / 3, 30, 40]);
      act(() => {
        harness.grid().clearFilter();
      });
      await harness.expectState([6], [6, 120, 24, 0, 40]);
    } finally {
      harness.unmount();
    }
  });

  it.each(['summary', 'item'] as const)(
    'skipEmptyValues=false at %s level changes average and minimum',
    async (level) => {
      const harness = mountGrid({
        dataSource: customers([null, 20, 30, 30, 40]),
        summary:
          level === 'summary'
            ? { totalItems, skipEmptyValues: false }
            : { totalItems: totalItems.map((item) => ({ ...item, skipEmptyValues: false })) },
      });
      try {
        await harness.ready();
        expect(harness.values()).toEqual([5, 120, 24, null, 40]);
      } finally {
        harness.unmount();
      }
    }
  );
});

describe('DevExtreme 26.1.4 native remote total summary semantics', () => {
  it('can omit descriptors on cached page loads while retaining whole-set footer values', async () => {
    const harness = mountProcessedGrid(true);
    try {
      await harness.ready();
      expect(harness.requests[0]?.totalSummary).toEqual(descriptors);
      await harness.expectState([1, 2], [6, 120, 24, 0, 40]);
      const footer = harness.footer();
      const requests = await harness.change(() => {
        void harness.grid().pageIndex(1);
      });
      expect(requests.every((request) => request.totalSummary === undefined)).toBe(true);
      expect(requests.at(-1)).toMatchObject({ skip: 2, take: 2 });
      await harness.expectState([3, 4], [6, 120, 24, 0, 40]);
      expect(harness.footer()).toEqual(footer);
    } finally {
      harness.unmount();
    }
  });

  it('resends descriptors for uncached page size, page, filter and sort loads', async () => {
    const harness = mountProcessedGrid(false);
    try {
      await harness.ready();
      await harness.expectState([1, 2], [6, 120, 24, 0, 40]);
      await harness.change(() => harness.grid().pageSize(1));
      await harness.expectState([1], [6, 120, 24, 0, 40]);
      const page = await harness.change(() => {
        void harness.grid().pageIndex(2);
      });
      expect(page.at(-1)).toMatchObject({ skip: 2, take: 1 });
      await harness.expectState([3], [6, 120, 24, 0, 40]);
      const filtered = await harness.change(() => harness.grid().filter(['id', '>', 3]));
      expect(filtered.at(-1)?.filter).toEqual(['id', '>', 3]);
      await harness.expectState([4], [3, 100, 100 / 3, 30, 40]);
      const sorted = await harness.change(() => {
        harness.grid().beginUpdate();
        harness.grid().columnOption('age', { sortOrder: 'desc', sortIndex: 0 });
        harness.grid().columnOption('id', { sortOrder: 'desc', sortIndex: 1 });
        harness.grid().endUpdate();
      });
      expect(sorted.at(-1)?.sort).toEqual([
        { selector: 'age', desc: true },
        { selector: 'id', desc: true },
      ]);
      await harness.expectState([6], [3, 100, 100 / 3, 30, 40]);
      await harness.change(() => {
        void harness.grid().pageIndex(1);
      });
      await harness.expectState([5], [3, 100, 100 / 3, 30, 40]);
      await harness.change(() => harness.grid().clearFilter());
      await harness.expectState([6], [6, 120, 24, 0, 40]);
      expect(
        harness.requests.every(
          (request) => JSON.stringify(request.totalSummary) === JSON.stringify(descriptors)
        )
      ).toBe(true);
    } finally {
      harness.unmount();
    }
  });

  it.each(['all-null', 'empty'] as const)(
    'accepts remote null values with blank labels for %s, unlike hidden local NaN',
    async (kind) => {
      const data = customers(kind === 'empty' ? [] : [null]);
      const store = new CustomStore<Customer, number>({
        key: 'id',
        loadMode: 'processed',
        load: async () => ({
          data,
          totalCount: data.length,
          summary: [data.length, 0, null, null, null],
        }),
      });
      const harness = mountGrid({ dataSource: store, remoteOperations });
      try {
        await harness.ready();
        expect(harness.values()).toEqual([data.length, 0, null, null, null]);
        expect(harness.footer()).toEqual([
          `count: ${data.length}`,
          'sum: 0',
          'avg:',
          'min:',
          'max:',
        ]);
      } finally {
        harness.unmount();
      }
    }
  );

  it.each(['summary', 'item'] as const)(
    'does not transmit skipEmptyValues=false at %s level or recalculate server totals',
    async (level) => {
      const load = vi.fn<SummaryLoad>(async () => ({
        data: customers([null, 20]),
        totalCount: 5,
        summary: [5, 120, 30, 20, 40],
      }));
      const store = new CustomStore<Customer, number>({ key: 'id', loadMode: 'processed', load });
      const harness = mountGrid({
        dataSource: store,
        remoteOperations,
        summary:
          level === 'summary'
            ? { totalItems, skipEmptyValues: false }
            : { totalItems: totalItems.map((item) => ({ ...item, skipEmptyValues: false })) },
      });
      try {
        await harness.ready();
        expect(load.mock.calls[0]?.[0].totalSummary).toEqual(descriptors);
        expect(load.mock.calls[0]?.[0]).not.toHaveProperty('skipEmptyValues');
        expect(harness.values()).toEqual([5, 120, 30, 20, 40]);
      } finally {
        harness.unmount();
      }
    }
  );

  it('forwards custom descriptors but ignores calculateCustomSummary, including callback-only changes', async () => {
    const calculateCustomSummary = vi.fn();
    const replacement = vi.fn();
    const load = vi.fn<SummaryLoad>(async () => ({
      data: customers([20, 30]),
      totalCount: 2,
      summary: [50, 777],
    }));
    const store = new CustomStore<Customer, number>({ key: 'id', loadMode: 'processed', load });
    const harness = mountGrid({
      dataSource: store,
      remoteOperations,
      summary: {
        calculateCustomSummary,
        totalItems: [
          { column: 'age', summaryType: 'sum', name: 'sum' },
          { column: 'age', summaryType: 'custom', name: 'custom' },
        ],
      },
    });
    try {
      await harness.ready();
      expect(load.mock.calls[0]?.[0].totalSummary).toEqual([
        { selector: 'age', summaryType: 'sum' },
        { selector: 'age', summaryType: 'custom' },
      ]);
      expect(harness.grid().getTotalSummaryValue('custom')).toBe(777);
      expect(harness.grid().getTotalSummaryValue('sum')).toBe(50);
      expect(harness.grid().option('summary.calculateCustomSummary')).toBe(calculateCustomSummary);
      expect(calculateCustomSummary).not.toHaveBeenCalled();
      const calls = load.mock.calls.length;
      act(() => {
        harness.grid().option('summary.calculateCustomSummary', replacement);
      });
      expect(harness.grid().option('summary.calculateCustomSummary')).toBe(replacement);
      await waitFor(() => {
        expect(load.mock.calls.length).toBeGreaterThan(calls);
        expect(harness.grid().getDataSource().isLoading()).toBe(false);
      });
      expect(harness.grid().getTotalSummaryValue('custom')).toBe(777);
      expect(calculateCustomSummary).not.toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
      expect(harness.onDataErrorOccurred).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });

  it('resolves native React Summary/TotalItem children during initialization before the first load', async () => {
    const events: string[] = [];
    let initializedSummary: GridProps['summary'];
    const calculateCustomSummary = vi.fn();
    const load = vi.fn<SummaryLoad>(async () => {
      events.push('load');
      expect(initializedSummary).toMatchObject({
        calculateCustomSummary,
        skipEmptyValues: false,
        totalItems: [
          { column: 'age', name: 'maximum', summaryType: 'max', displayFormat: 'Largest {0}' },
          { name: 'rows', summaryType: 'count', showInColumn: 'id', skipEmptyValues: false },
        ],
      });
      return { data: customers([20]), totalCount: 1, summary: [20, 1] };
    });
    const store = new CustomStore<Customer, number>({ key: 'id', loadMode: 'processed', load });
    const harness = mountGrid({
      dataSource: store,
      remoteOperations,
      onInitialized: (event) => {
        events.push('initialized');
        const resolved = event.component!.option('summary');
        initializedSummary = {
          ...resolved,
          totalItems: resolved?.totalItems?.map((item) => ({ ...item })),
        };
        expect(load).not.toHaveBeenCalled();
      },
      children: (
        <Summary calculateCustomSummary={calculateCustomSummary} skipEmptyValues={false}>
          <TotalItem column="age" name="maximum" summaryType="max" displayFormat="Largest {0}" />
          <TotalItem name="rows" summaryType="count" showInColumn="id" skipEmptyValues={false} />
        </Summary>
      ),
    });
    try {
      await harness.ready();
      expect(events).toEqual(['initialized', 'load']);
      expect(load.mock.calls[0]?.[0].totalSummary).toEqual([
        { selector: 'age', summaryType: 'max' },
        { selector: undefined, summaryType: 'count' },
      ]);
      expect(harness.grid().getTotalSummaryValue('maximum')).toBe(20);
      expect(harness.grid().getTotalSummaryValue('rows')).toBe(1);
      expect(calculateCustomSummary).not.toHaveBeenCalled();
    } finally {
      harness.unmount();
    }
  });
});
