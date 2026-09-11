import { describe, it, expect, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import ArrayStore from 'devextreme/data/array_store';
import CustomStore from 'devextreme/data/custom_store';
import DataSource from 'devextreme/data/data_source';
import DataGrid, { type DataGridRef } from 'devextreme-react/data-grid';
import type { LoadOptions } from 'devextreme/common/data';

interface RecordRow {
  id: number;
  country: string | null;
  city: string;
  amount: number;
  active: boolean;
  joined: Date;
}

interface GroupResult {
  key: unknown;
  items: (GroupResult | RecordRow)[] | null;
  summary?: number[];
}

type GridKey = number | unknown[];
type GridProps = ComponentProps<typeof DataGrid<RecordRow, GridKey>>;

const records: RecordRow[] = [
  {
    id: 1,
    country: 'UK',
    city: 'London',
    amount: 10,
    active: false,
    joined: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 2,
    country: 'uk',
    city: 'London',
    amount: 20,
    active: true,
    joined: new Date('2024-01-01T00:00:00Z'),
  },
  {
    id: 3,
    country: 'UK',
    city: 'York',
    amount: 30,
    active: false,
    joined: new Date('2024-02-01T00:00:00Z'),
  },
  {
    id: 4,
    country: 'US',
    city: 'Boston',
    amount: 40,
    active: true,
    joined: new Date('2024-02-01T00:00:00Z'),
  },
  {
    id: 5,
    country: 'US',
    city: 'Boston',
    amount: 50,
    active: false,
    joined: new Date('2024-02-01T00:00:00Z'),
  },
  {
    id: 6,
    country: 'US',
    city: 'Denver',
    amount: 60,
    active: true,
    joined: new Date('2024-03-01T00:00:00Z'),
  },
  {
    id: 7,
    country: null,
    city: 'Unknown',
    amount: 70,
    active: false,
    joined: new Date('2024-03-01T00:00:00Z'),
  },
  {
    id: 8,
    country: 'DE',
    city: 'Berlin',
    amount: 80,
    active: true,
    joined: new Date('2024-03-01T00:00:00Z'),
  },
];

const remoteOperations = {
  paging: true,
  sorting: true,
  filtering: true,
  grouping: true,
  summary: true,
  groupPaging: false,
};

const columns: GridProps['columns'] = [
  { dataField: 'id', dataType: 'number' },
  { dataField: 'country', dataType: 'string', groupIndex: 0 },
  { dataField: 'city', dataType: 'string' },
  { dataField: 'amount', dataType: 'number' },
  { dataField: 'active', dataType: 'boolean' },
  { dataField: 'joined', dataType: 'date' },
];

const searchOptions = {
  searchOperation: 'contains',
  searchValue: null,
  searchExpr: '__undefined__',
  userData: {},
};
const summaryDescriptors = [
  { selector: 'id', summaryType: 'count' },
  { selector: 'amount', summaryType: 'sum' },
];

function groupDescriptors(desc = false, nested = false, innerDesc = false) {
  return [
    { selector: 'country', desc, isExpanded: nested },
    ...(nested ? [{ selector: 'city', desc: innerDesc, isExpanded: false }] : []),
  ];
}

// Preserve own undefined/function properties that JSON serialization would omit.
function snapshot(value: unknown): unknown {
  if (value === undefined) return '__undefined__';
  if (typeof value === 'function') return '__function__';
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(snapshot);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]));
  }
  return value;
}

function mountGrid(props: GridProps) {
  const ref = createRef<DataGridRef<RecordRow, GridKey>>();
  const onContentReady = vi.fn();
  const onDataErrorOccurred = vi.fn();
  const view = render(
    <DataGrid<RecordRow, GridKey>
      ref={ref}
      columns={columns}
      remoteOperations={remoteOperations}
      grouping={{ autoExpandAll: true }}
      defaultPaging={{ pageSize: 2 }}
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
    async ready() {
      await waitFor(() => {
        expect(onContentReady).toHaveBeenCalled();
        expect(grid().getDataSource().isLoading()).toBe(false);
      });
      expect(onDataErrorOccurred).not.toHaveBeenCalled();
    },
    state() {
      return {
        pageIndex: grid().pageIndex(),
        pageSize: grid().pageSize(),
        pageCount: grid().pageCount(),
        totalCount: grid().totalCount(),
        rows: grid()
          .getVisibleRows()
          .map((row) => ({
            type: row.rowType,
            key: row.key,
            id: row.rowType === 'data' ? row.data.id : undefined,
            isExpanded: row.isExpanded,
          })),
      };
    },
  };
}

function mountRemote(props: Partial<GridProps> = {}, includeTotalCount = true) {
  const arrayStore = new ArrayStore<RecordRow, number>({ key: 'id', data: records });
  const requests: unknown[] = [];
  const wireRequests: unknown[] = [];
  const responses: unknown[] = [];
  const store = new CustomStore<RecordRow, number>({
    key: 'id',
    loadMode: 'processed',
    load: async (options: LoadOptions<RecordRow>) => {
      requests.push(snapshot(options));
      wireRequests.push(JSON.parse(JSON.stringify(options)));
      const filtered = (await arrayStore.load({ filter: options.filter })) as RecordRow[];
      const data = (await arrayStore.load(options)) as (GroupResult | RecordRow)[];
      function summaries(items: (GroupResult | RecordRow)[]): RecordRow[] {
        return items.flatMap((item) => {
          if ('id' in item) return [item];
          const leaves = summaries(item.items ?? []);
          if (Array.isArray(options.groupSummary) && options.groupSummary.length)
            item.summary = [leaves.length, leaves.reduce((sum, row) => sum + row.amount, 0)];
          return leaves;
        });
      }
      summaries(data);
      const result = {
        data,
        ...(includeTotalCount ? { totalCount: filtered.length } : {}),
        ...(Array.isArray(options.totalSummary) && options.totalSummary.length
          ? { summary: [filtered.length, filtered.reduce((sum, row) => sum + row.amount, 0)] }
          : {}),
      };
      responses.push(snapshot(result));
      return result;
    },
  });
  const harness = mountGrid({ dataSource: store, ...props });
  return {
    ...harness,
    requests,
    wireRequests,
    responses,
    async change(action: () => unknown) {
      const start = requests.length;
      await act(async () => {
        await action();
      });
      await harness.ready();
      return requests.slice(start);
    },
  };
}

describe('DevExtreme 26.1.4 native grouping conformance', () => {
  it('loads all groups once; pages, changes page size, collapses and expands locally', async () => {
    const h = mountRemote();
    await h.ready();
    expect(h.requests).toEqual([
      { ...searchOptions, filter: '__undefined__', sort: null, group: groupDescriptors() },
    ]);
    expect(h.wireRequests).toEqual([
      {
        searchOperation: 'contains',
        searchValue: null,
        userData: {},
        sort: null,
        group: groupDescriptors(),
      },
    ]);
    expect(h.state()).toMatchObject({ pageIndex: 0, pageSize: 2, pageCount: 8, totalCount: 8 });
    expect(h.state().rows.map((row) => row.key)).toEqual([[null], 7]);
    const page = await h.change(() => h.grid().pageIndex(1));
    expect(page).toEqual([]);
    expect(h.state().rows.map((row) => row.key)).toEqual([['DE'], 8]);
    const size = await h.change(() => h.grid().pageSize(3));
    expect(size).toEqual([]);
    expect(h.state()).toMatchObject({ pageIndex: 1, pageSize: 3, pageCount: 6 });
    const collapse = await h.change(() => h.grid().collapseRow(['UK']));
    expect(collapse).toEqual([]);
    expect(h.grid().isRowExpanded(['UK'])).toBe(false);
    expect(h.grid().pageCount()).toBe(5);
    const expand = await h.change(() => h.grid().expandRow(['UK']));
    expect(expand).toEqual([]);
    expect(h.grid().isRowExpanded(['UK'])).toBe(true);
    expect(h.grid().pageCount()).toBe(6);
    expect(h.requests).toHaveLength(1);
  });

  it('emits two-level desc/asc, total and group summaries, filter and independent row sort', async () => {
    const h = mountRemote({
      columns: [
        { dataField: 'country', dataType: 'string', groupIndex: 0, sortOrder: 'desc' },
        { dataField: 'city', dataType: 'string', groupIndex: 1, sortOrder: 'asc' },
        { dataField: 'amount', dataType: 'number', sortOrder: 'desc', sortIndex: 0 },
      ],
      filterValue: ['amount', '>=', 20],
      paging: { pageSize: 5 },
      summary: {
        groupItems: [
          { column: 'id', summaryType: 'count' },
          { column: 'amount', summaryType: 'sum' },
        ],
        totalItems: [
          { column: 'id', summaryType: 'count', name: 'rows' },
          { column: 'amount', summaryType: 'sum', name: 'sum' },
        ],
      },
    });
    await h.ready();
    expect(h.requests).toEqual([
      {
        ...searchOptions,
        filter: ['amount', '>=', 20],
        sort: [{ selector: 'amount', desc: true }],
        group: groupDescriptors(true, true),
        groupSummary: summaryDescriptors,
        totalSummary: summaryDescriptors,
      },
    ]);
    expect(h.grid().getTotalSummaryValue('rows')).toBe(7);
    expect(h.grid().getTotalSummaryValue('sum')).toBe(350);
    expect(h.state().rows.map((row) => row.key)).toEqual([
      ['US'],
      ['US', 'Boston'],
      5,
      4,
      ['US', 'Denver'],
    ]);
    expect(await h.change(() => h.grid().pageIndex(1))).toEqual([]);
    expect(h.grid().getTotalSummaryValue('sum')).toBe(350);
  });

  it.each(['initial', 'clearGrouping', 'groupIndex'])(
    'omits configured group summaries without groups via %s',
    async (mode) => {
      for (const withTotal of [false, true]) {
        const h = mountRemote({
          columns: [
            { dataField: 'id', dataType: 'number' },
            {
              dataField: 'country',
              dataType: 'string',
              ...(mode === 'initial' ? {} : { groupIndex: 0 }),
            },
            { dataField: 'amount', dataType: 'number', sortOrder: 'desc' },
          ],
          defaultPaging: { pageSize: 5 },
          summary: {
            groupItems: [
              { column: 'id', summaryType: 'count' },
              { column: 'amount', summaryType: 'sum' },
            ],
            ...(withTotal
              ? {
                  totalItems: [
                    { column: 'id', summaryType: 'count', name: 'rows' },
                    { column: 'amount', summaryType: 'sum', name: 'sum' },
                  ],
                }
              : {}),
          },
        });
        await h.ready();
        const totalSummary = withTotal ? summaryDescriptors : [];
        const ungroupedRequest = {
          ...searchOptions,
          filter: '__undefined__',
          sort: [{ selector: 'amount', desc: true }],
          group: null,
          requireTotalCount: true,
          skip: 0,
          take: 5,
          totalSummary,
        };
        if (mode !== 'initial') {
          expect(h.requests).toEqual([
            {
              ...searchOptions,
              filter: '__undefined__',
              sort: [{ selector: 'amount', desc: true }],
              group: groupDescriptors(),
              groupSummary: summaryDescriptors,
              totalSummary,
            },
          ]);
          expect(
            await h.change(() =>
              mode === 'clearGrouping'
                ? h.grid().clearGrouping()
                : h.grid().columnOption('country', 'groupIndex', -1)
            )
          ).toEqual([ungroupedRequest]);
          expect(h.requests).toHaveLength(2);
        } else {
          expect(h.requests).toEqual([ungroupedRequest]);
        }
        expect(h.requests.at(-1)).not.toHaveProperty('groupSummary');
        expect(h.wireRequests.at(-1)).toEqual({
          searchOperation: 'contains',
          searchValue: null,
          userData: {},
          sort: [{ selector: 'amount', desc: true }],
          group: null,
          requireTotalCount: true,
          skip: 0,
          take: 5,
          totalSummary,
        });
        expect(h.grid().option('summary.groupItems')).toEqual([
          { column: 'id', summaryType: 'count' },
          { column: 'amount', summaryType: 'sum' },
        ]);
        expect(h.state()).toMatchObject({ pageIndex: 0, pageSize: 5, pageCount: 2, totalCount: 8 });
        expect(h.state().rows.every((row) => row.type === 'data')).toBe(true);
        expect(h.state().rows.map((row) => row.id)).toEqual([8, 7, 6, 5, 4]);
        if (withTotal) {
          expect(h.grid().getTotalSummaryValue('rows')).toBe(8);
          expect(h.grid().getTotalSummaryValue('sum')).toBe(360);
        }
        h.unmount();
      }
    }
  );

  it('excludes grouped columns from ordinary sort even with explicit sortOrder and sortIndex', async () => {
    const h = mountRemote({
      sorting: { mode: 'multiple' },
      columns: [
        {
          dataField: 'country',
          dataType: 'string',
          groupIndex: 0,
          sortOrder: 'desc',
          sortIndex: 0,
        },
        { dataField: 'city', dataType: 'string', groupIndex: 1, sortOrder: 'asc', sortIndex: 1 },
        { dataField: 'amount', dataType: 'number', sortOrder: 'desc', sortIndex: 2 },
      ],
      defaultPaging: { pageSize: 5 },
    });
    await h.ready();
    expect(h.requests).toEqual([
      {
        ...searchOptions,
        filter: '__undefined__',
        sort: [{ selector: 'amount', desc: true }],
        group: groupDescriptors(true, true),
      },
    ]);
    expect(h.wireRequests).toEqual([
      {
        searchOperation: 'contains',
        searchValue: null,
        userData: {},
        sort: [{ selector: 'amount', desc: true }],
        group: groupDescriptors(true, true),
      },
    ]);
  });

  it.each([
    {
      selector: 'country',
      keys: [null, 'DE', 'UK', 'uk', 'US'],
      descending: ['US', 'UK', 'uk', 'DE', null],
      ids: [[7], [8], [1, 3], [2], [4, 5, 6]],
    },
    {
      selector: 'amount',
      keys: [10, 20, 30, 40, 50, 60, 70, 80],
      ids: [[1], [2], [3], [4], [5], [6], [7], [8]],
    },
    {
      selector: 'active',
      keys: [false, true],
      ids: [
        [1, 3, 5, 7],
        [2, 4, 6, 8],
      ],
    },
    {
      selector: 'joined',
      keys: [records[0]!.joined, records[2]!.joined, records[5]!.joined],
      ids: [
        [1, 2],
        [3, 4, 5],
        [6, 7, 8],
      ],
    },
  ])(
    'preserves $selector key types, exact grouping equality, asc/desc order and JSON in ArrayStore and local DataGrid',
    async ({ selector, keys, descending, ids }) => {
      const store = new ArrayStore<RecordRow, number>({ key: 'id', data: records });
      for (const desc of [false, true]) {
        const expected = desc ? (descending ?? [...keys].reverse()) : keys;
        const data = (await store.load({
          group: [{ selector, desc }],
        })) as unknown as GroupResult[];
        expect(data.map((group) => group.key)).toEqual(expected);
        if (!desc)
          expect(
            data.map((group) => group.items?.map((row) => ('id' in row ? row.id : null)))
          ).toEqual(ids);
        expect(JSON.parse(JSON.stringify(data.map((group) => group.key)))).toEqual(
          snapshot(expected)
        );
        if (selector === 'joined')
          expect(data.every((group) => group.key instanceof Date)).toBe(true);
        const h = mountGrid({
          dataSource: store,
          remoteOperations: false,
          paging: { pageSize: 50 },
          columns: columns.map((column) =>
            typeof column === 'object'
              ? {
                  ...column,
                  groupIndex: column.dataField === selector ? 0 : undefined,
                  sortOrder: column.dataField === selector ? (desc ? 'desc' : 'asc') : undefined,
                }
              : column
          ),
        });
        await h.ready();
        expect(
          h
            .grid()
            .getVisibleRows()
            .filter((row) => row.rowType === 'group')
            .map((row) => {
              expect(Array.isArray(row.key)).toBe(true);
              return (row.key as unknown[])[0];
            })
        ).toEqual(expected);
        h.unmount();
      }
    }
  );

  it.each([
    {
      name: 'one desc',
      columns: [{ dataField: 'country', dataType: 'string', groupIndex: 0, sortOrder: 'desc' }],
    },
    {
      name: 'two asc desc',
      columns: [
        { dataField: 'country', dataType: 'string', groupIndex: 0 },
        { dataField: 'city', dataType: 'string', groupIndex: 1, sortOrder: 'desc' },
      ],
    },
    {
      name: 'calculateGroupValue string',
      columns: [
        { dataField: 'country', dataType: 'string', groupIndex: 0, calculateGroupValue: 'city' },
      ],
    },
    {
      name: 'calculateGroupValue function',
      columns: [
        {
          dataField: 'country',
          dataType: 'string',
          groupIndex: 0,
          calculateGroupValue: (row: RecordRow) => row.country?.toUpperCase(),
        },
      ],
    },
    {
      name: 'date header interval',
      columns: [
        {
          dataField: 'joined',
          dataType: 'date',
          groupIndex: 0,
          headerFilter: { groupInterval: 'month' },
        },
      ],
    },
    {
      name: 'column collapsed unsupported',
      columns: [
        { dataField: 'country', dataType: 'string', groupIndex: 0, autoExpandGroup: false },
      ],
    },
    { name: 'all collapsed unsupported', columns, grouping: { autoExpandAll: false } },
  ] satisfies (Partial<GridProps> & { name: string })[])(
    'captures $name without conflating it with supported expanded string grouping',
    async ({ name, ...props }) => {
      const h = mountRemote(props);
      await h.ready();
      const group =
        name === 'one desc'
          ? groupDescriptors(true)
          : name === 'two asc desc'
            ? groupDescriptors(false, true, true)
            : name === 'calculateGroupValue string'
              ? [{ selector: 'city', desc: false, isExpanded: false }]
              : name === 'calculateGroupValue function'
                ? [{ selector: '__function__', desc: false, isExpanded: false }]
                : name === 'date header interval'
                  ? [{ selector: 'joined', desc: false, isExpanded: false }]
                  : groupDescriptors();
      expect(h.requests).toEqual([
        { ...searchOptions, filter: '__undefined__', sort: null, group },
      ]);
      if (name === 'calculateGroupValue function') {
        expect(h.wireRequests).toEqual([
          {
            searchOperation: 'contains',
            searchValue: null,
            userData: {},
            sort: null,
            group: [{ desc: false, isExpanded: false }],
          },
        ]);
      }
      if (name.includes('unsupported')) {
        expect(
          h.state().rows.every((row) => row.type === 'group' && row.isExpanded === false)
        ).toBe(true);
        expect(h.grid().pageCount()).toBe(3);
        expect(await h.change(() => h.grid().expandRow(['UK']))).toEqual([]);
        expect(h.grid().isRowExpanded(['UK'])).toBe(true);
        expect(h.grid().pageCount()).toBe(4);
      }
    }
  );

  it('renders recursive key/items/summary results without totalCount, groupCount or node count', async () => {
    const h = mountRemote(
      {
        columns: [
          { dataField: 'country', dataType: 'string', groupIndex: 0 },
          { dataField: 'city', dataType: 'string', groupIndex: 1 },
          { dataField: 'amount', dataType: 'number' },
        ],
        summary: {
          groupItems: [
            { column: 'id', summaryType: 'count' },
            { column: 'amount', summaryType: 'sum' },
          ],
        },
        paging: { pageSize: 50 },
      },
      false
    );
    await h.ready();
    expect(h.requests).toEqual([
      {
        ...searchOptions,
        filter: '__undefined__',
        sort: null,
        group: groupDescriptors(false, true),
        groupSummary: summaryDescriptors,
        totalSummary: [],
      },
    ]);
    expect(h.responses[0]).not.toHaveProperty('totalCount');
    expect(h.responses[0]).not.toHaveProperty('groupCount');
    expect(h.responses[0]).not.toHaveProperty('summary');
    function checkGroups(items: GroupResult[]) {
      for (const item of items) {
        expect(Object.keys(item).sort()).toEqual(['items', 'key', 'summary']);
        expect(item.summary).toHaveLength(2);
        const first = item.items?.[0];
        if (first && !('id' in first)) checkGroups(item.items as GroupResult[]);
      }
    }
    checkGroups((h.responses[0] as { data: GroupResult[] }).data);
    expect(h.grid().totalCount()).toBe(8);
    expect(
      h
        .state()
        .rows.filter((row) => row.type === 'data')
        .map((row) => row.id)
    ).toEqual([7, 8, 1, 3, 2, 4, 5, 6]);
    expect(h.container.querySelector('.dx-datagrid-rowsview')).toHaveTextContent(
      'Country: UK (Count: 2, Sum of Amount is 40)'
    );
    expect(h.container.querySelector('.dx-datagrid-rowsview')).toHaveTextContent(
      'City: Boston (Count: 2, Sum of Amount is 90)'
    );
    expect(await h.change(() => h.grid().collapseRow(['UK']))).toEqual([]);
    expect(
      h
        .state()
        .rows.filter((row) => row.type === 'data')
        .map((row) => row.id)
    ).not.toContain(1);
    expect(await h.change(() => h.grid().expandRow(['UK']))).toEqual([]);
    expect(await h.change(() => h.grid().collapseRow(['US', 'Boston']))).toEqual([]);
    expect(
      h
        .state()
        .rows.filter((row) => row.type === 'data')
        .map((row) => row.id)
    ).not.toContain(4);
    expect(await h.change(() => h.grid().expandRow(['US', 'Boston']))).toEqual([]);
    expect(h.requests).toHaveLength(1);
  });

  it('forwards explicit DataSource count/paging flags, intervals and function selectors outside native grid configuration', async () => {
    const requests: unknown[] = [];
    const store = new CustomStore({
      loadMode: 'processed',
      load: async (options) => {
        requests.push(snapshot(options));
        return { data: [{ key: 'UK', items: [records[0]] }], totalCount: 8, groupCount: 5 };
      },
    });
    const source = new DataSource({
      store,
      group: [{ selector: 'country' }],
      paginate: true,
      pageSize: 2,
      requireTotalCount: true,
    });
    source.loadOptions().requireGroupCount = true;
    await source.load();
    source.pageIndex(1);
    await source.load();
    expect(requests).toEqual(
      [0, 2].map((skip) => ({
        ...searchOptions,
        group: [{ selector: 'country' }],
        requireTotalCount: true,
        requireGroupCount: true,
        skip,
        take: 2,
      }))
    );
    source.dispose();
    for (const group of [
      [{ selector: 'joined', groupInterval: 'month' as const }],
      [{ selector: 'amount', groupInterval: 25, desc: true, isExpanded: true }],
      [{ selector: (row: RecordRow) => row.city }],
    ]) {
      const direct = new DataSource({ store, group, paginate: false });
      await direct.load();
      direct.dispose();
    }
    expect(requests.slice(2)).toEqual([
      { ...searchOptions, group: [{ selector: 'joined', groupInterval: 'month' }] },
      {
        ...searchOptions,
        group: [{ selector: 'amount', groupInterval: 25, desc: true, isExpanded: true }],
      },
      { ...searchOptions, group: [{ selector: '__function__' }] },
    ]);
  });

  it.each(['none', 'group', 'both'])(
    'matches every local page with summaries=%s, including repeated group headers',
    async (withSummary) => {
      const props: Partial<GridProps> = {
        columns: [
          { dataField: 'country', dataType: 'string', groupIndex: 0 },
          { dataField: 'city', dataType: 'string', groupIndex: 1 },
          { dataField: 'amount', dataType: 'number' },
        ],
        paging: { pageSize: 5 },
        ...(withSummary !== 'none'
          ? {
              summary: {
                groupItems: [
                  { column: 'id', summaryType: 'count' },
                  { column: 'amount', summaryType: 'sum' },
                ],
                ...(withSummary === 'both'
                  ? {
                      totalItems: [
                        { column: 'id', summaryType: 'count' },
                        { column: 'amount', summaryType: 'sum' },
                      ],
                    }
                  : {}),
              },
            }
          : {}),
      };
      for (const mode of ['remote-total', 'remote-no-total', 'local']) {
        const h =
          mode === 'local'
            ? mountGrid({
                ...props,
                dataSource: new ArrayStore({ key: 'id', data: records }),
                remoteOperations: false,
              })
            : mountRemote(props, mode === 'remote-total');
        await h.ready();
        const pages = [];
        for (let page = 0; page < h.grid().pageCount() && page < 20; page++) {
          await act(async () => {
            await h.grid().pageIndex(page);
          });
          await h.ready();
          pages.push(h.state().rows.map((row) => (row.type === 'data' ? row.id : row.key)));
        }
        expect(pages).toEqual([
          [[null], [null, 'Unknown'], 7, ['DE'], ['DE', 'Berlin']],
          [['DE'], ['DE', 'Berlin'], 8, ['UK'], ['UK', 'London']],
          [['UK'], ['UK', 'London'], 1, ['UK', 'York'], 3],
          [['uk'], ['uk', 'London'], 2, ['US'], ['US', 'Boston']],
          [['US'], ['US', 'Boston'], 4, 5, ['US', 'Denver']],
          [['US'], ['US', 'Denver'], 6],
        ]);
        expect(h.grid().pageCount()).toBe(6);
        expect(h.grid().totalCount()).toBe(8);
        if ('requests' in h) expect(h.requests).toHaveLength(1);
        h.unmount();
      }
    }
  );

  it('reloads for filter, row sort and group sort but not page or page-size changes', async () => {
    const h = mountRemote({
      columns: [
        { dataField: 'country', dataType: 'string', groupIndex: 0 },
        { dataField: 'city', dataType: 'string', groupIndex: 1 },
        { dataField: 'amount', dataType: 'number' },
      ],
    });
    await h.ready();
    expect(await h.change(() => h.grid().pageIndex(1))).toEqual([]);
    expect(await h.change(() => h.grid().pageSize(5))).toEqual([]);
    expect(h.grid().pageCount()).toBe(6);
    expect(await h.change(() => h.grid().filter(['amount', '>=', 40]))).toEqual([
      {
        ...searchOptions,
        filter: ['amount', '>=', 40],
        sort: null,
        group: groupDescriptors(false, true),
      },
    ]);
    expect(h.grid().pageIndex()).toBe(0);
    expect(h.grid().totalCount()).toBe(5);
    expect(await h.change(() => h.grid().columnOption('amount', 'sortOrder', 'desc'))).toEqual([
      {
        ...searchOptions,
        filter: ['amount', '>=', 40],
        sort: [{ selector: 'amount', desc: true }],
        group: groupDescriptors(false, true),
      },
    ]);
    expect(await h.change(() => h.grid().columnOption('country', 'sortOrder', 'desc'))).toEqual([
      {
        ...searchOptions,
        filter: ['amount', '>=', 40],
        sort: [{ selector: 'amount', desc: true }],
        group: groupDescriptors(true, true),
      },
    ]);
    expect(h.state().rows.map((row) => row.key)).toEqual([
      ['US'],
      ['US', 'Boston'],
      5,
      4,
      ['US', 'Denver'],
    ]);
  });

  it('keeps UK/uk distinct but ties their sort comparison in both directions', async () => {
    for (const data of [
      [records[0]!, records[1]!],
      [records[1]!, records[0]!],
    ]) {
      const store = new ArrayStore({ key: 'id', data });
      for (const desc of [false, true]) {
        const groups = (await store.load({
          group: [{ selector: 'country', desc }],
        })) as unknown as GroupResult[];
        expect(groups.map((group) => group.key)).toEqual(data.map((row) => row.country));
        expect(groups.map((group) => group.items?.length)).toEqual([1, 1]);
      }
    }
    const store = new ArrayStore({ key: 'id', data: [records[0]!, records[1]!] });
    const groups = (await store.load({
      group: [{ selector: 'country' }],
      sort: [{ selector: 'amount', desc: true }],
    })) as unknown as GroupResult[];
    expect(groups.map((group) => group.key)).toEqual(['uk', 'UK']);
  });

  it('orders integer keys numerically rather than lexicographically', async () => {
    const store = new ArrayStore({ data: [2, 10, -2, 0].map((amount) => ({ amount })) });
    for (const desc of [false, true]) {
      const groups = (await store.load({
        group: [{ selector: 'amount', desc }],
      })) as unknown as GroupResult[];
      expect(groups.map((group) => group.key)).toEqual(desc ? [10, 2, 0, -2] : [-2, 0, 2, 10]);
    }
  });

  it('characterizes items:null/count fallback separately from complete expanded trees', async () => {
    const requests: unknown[] = [];
    const store = new ArrayStore<RecordRow, number>({
      key: 'id',
      data: [records[0]!, records[2]!],
    });
    const load = vi.fn(async (options: LoadOptions<RecordRow>) => {
      requests.push(snapshot(options));
      return {
        data: options.group ? [{ key: 'UK', items: null, count: 2 }] : await store.load(options),
        totalCount: 2,
      };
    });
    const h = mountGrid({
      dataSource: new CustomStore<RecordRow, number>({ key: 'id', loadMode: 'processed', load }),
    });
    await h.ready();
    const leafRequest = {
      searchOperation: 'contains',
      searchValue: null,
      userData: {},
      sort: [{ selector: 'country', desc: false, isExpanded: true }],
      group: null,
      requireTotalCount: false,
      requireGroupCount: false,
      filter: ['country', '=', 'UK'],
      skip: '__undefined__',
      take: 1,
    };
    expect(requests).toEqual([
      { ...searchOptions, filter: '__undefined__', sort: null, group: groupDescriptors() },
      leafRequest,
    ]);
    expect(h.state().rows.map((row) => row.key)).toEqual([['UK'], 1]);
    await act(async () => {
      await h.grid().pageIndex(1);
    });
    await h.ready();
    expect(requests.slice(2)).toEqual([{ ...leafRequest, skip: 1 }]);
    expect(h.state()).toMatchObject({ pageIndex: 1, pageSize: 2, pageCount: 2, totalCount: 2 });
    expect(h.state().rows.map((row) => row.key)).toEqual([['UK'], 3]);
    await act(async () => {
      await h.grid().pageIndex(0);
    });
    await h.ready();
    const beforeCollapse = requests.length;
    await act(async () => {
      await h.grid().collapseRow(['UK']);
    });
    await h.ready();
    expect(requests).toHaveLength(beforeCollapse);
    await act(async () => {
      await h.grid().expandRow(['UK']);
    });
    await h.ready();
    expect(requests.slice(beforeCollapse)).toEqual([leafRequest]);
    expect(h.state().rows.map((row) => row.key)).toEqual([['UK'], 1]);
  });

  it('reloads complete groups with cacheEnabled:false without turning on remote grouped paging', async () => {
    const h = mountRemote({ cacheEnabled: false, defaultPaging: { pageSize: 5 } });
    await h.ready();
    const expected = [
      { ...searchOptions, filter: '__undefined__', sort: null, group: groupDescriptors() },
    ];
    expect(h.requests).toEqual(expected);
    expect(await h.change(() => h.grid().pageIndex(1))).toEqual(expected);
    expect(await h.change(() => h.grid().pageSize(3))).toEqual(expected);
    expect(await h.change(() => h.grid().collapseRow(['UK']))).toEqual(expected);
    expect(h.grid().isRowExpanded(['UK'])).toBe(false);
    expect(await h.change(() => h.grid().expandRow(['UK']))).toEqual(expected);
    expect(h.grid().isRowExpanded(['UK'])).toBe(true);
  });
});
