import { afterEach, describe, expect, it } from 'vitest';
import DataGrid, { type Column, type Properties } from 'devextreme/ui/data_grid';
import CustomStore from 'devextreme/data/custom_store';

type Row = { id: number; label: string; rank: number; category: string; extra: string };
type Grid = DataGrid<Row, number>;
type Event = { name: string; fullName: string; value: unknown; previousValue: unknown };

const rows: Row[] = Array.from({ length: 24 }, (_, index) => ({
  id: index + 1,
  label: `item ${String(index + 1).padStart(2, '0')}`,
  rank: index + 1,
  category: index < 12 ? 'A' : 'B',
  extra: `extra ${index + 1}`,
}));

const disposers: (() => void)[] = [];

afterEach(() => {
  disposers
    .splice(0)
    .reverse()
    .forEach((dispose) => dispose());
});

const pause = () => new Promise((resolve) => setTimeout(resolve, 10));

async function mount(options: Properties<Row, number> = {}) {
  const calls = { load: 0, byKey: 0 };
  const events: Event[] = [];
  const errors: unknown[] = [];
  let contentReady = 0;
  const host = document.createElement('div');
  document.body.append(host);
  const store = new CustomStore<Row, number>({
    key: 'id',
    loadMode: 'processed',
    load: async () => {
      calls.load += 1;
      return { data: rows.map((row) => ({ ...row })), totalCount: rows.length };
    },
    byKey: async (key) => {
      calls.byKey += 1;
      const row = rows.find((candidate) => candidate.id === key);
      if (!row) throw new Error(`Missing key ${key}`);
      return { ...row };
    },
  });
  const grid = new DataGrid<Row, number>(host, {
    dataSource: store,
    remoteOperations: false,
    width: 1000,
    height: 400,
    paging: { pageSize: 3 },
    scrolling: { mode: 'standard', useNative: false },
    loadPanel: { enabled: false },
    columnChooser: { enabled: true },
    groupPanel: { visible: true },
    columnFixing: { enabled: true },
    columns: [
      { dataField: 'id', width: 70 },
      { dataField: 'label', name: 'display', width: '25%' },
      { dataField: 'rank', width: 110 },
      { dataField: 'category', width: 120 },
    ],
    ...options,
    onOptionChanged: (event) =>
      events.push({
        name: event.name,
        fullName: event.fullName,
        value: event.value,
        previousValue: event.previousValue,
      }),
    onContentReady: () => {
      contentReady += 1;
    },
    onDataErrorOccurred: (event) => errors.push(event.error),
  });
  disposers.push(() => {
    grid.dispose();
    host.remove();
  });

  // Wait for native deferred work and three quiet turns; never call load/refresh to settle.
  const settle = async () => {
    let previous = '';
    let quiet = 0;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      await pause();
      const current = JSON.stringify([calls, events.length, contentReady, grid.state()]);
      quiet =
        contentReady > 0 && !grid.getDataSource().isLoading() && current === previous
          ? quiet + 1
          : 0;
      previous = current;
      if (quiet === 3) {
        expect(errors).toEqual([]);
        return;
      }
    }
    throw new Error('Native grid did not settle');
  };
  await settle();
  events.length = 0;
  return { grid, calls, events, settle };
}

function queryState(grid: Grid) {
  return {
    filterValue: grid.option('filterValue'),
    // Native filter arrays carry extra column metadata; compare the complete serialized expression.
    filter: JSON.parse(JSON.stringify(grid.getCombinedFilter(true) ?? null)),
    searchText: grid.option('searchPanel.text'),
    pageIndex: grid.pageIndex(),
    pageSize: grid.pageSize(),
    selectedRowKeys: grid.option('selectedRowKeys'),
    selectionFilter: grid.option('selectionFilter'),
    columns: Array.from({ length: grid.columnCount() }, (_, index) => {
      const column = grid.columnOption(index);
      return {
        dataField: column.dataField,
        sortOrder: column.sortOrder,
        sortIndex: column.sortIndex,
        groupIndex: column.groupIndex,
        filterValue: column.filterValue,
        filterValues: column.filterValues,
      };
    }),
  };
}

async function queriedGrid() {
  const probe = await mount({
    selection: { mode: 'multiple' },
    selectedRowKeys: [6],
    filterValue: ['rank', '>=', 4],
    searchPanel: { visible: true, text: 'item' },
    columns: [
      {
        dataField: 'id',
        dataType: 'number',
        width: 70,
        filterValue: 6,
        selectedFilterOperation: '>=',
      },
      { dataField: 'label', dataType: 'string', name: 'display', width: '25%' },
      { dataField: 'rank', dataType: 'number', width: 110, sortOrder: 'desc', sortIndex: 0 },
      { dataField: 'category', dataType: 'string', width: 120, groupIndex: 0 },
    ],
  });
  await probe.grid.pageIndex(1);
  await probe.settle();
  probe.events.length = 0;
  expect(probe.grid.pageIndex()).toBe(1);
  expect(probe.grid.option('selectedRowKeys')).toEqual([6]);
  return probe;
}

function layout(grid: Grid) {
  return Array.from({ length: grid.columnCount() }, (_, index) => {
    const column = grid.columnOption(index);
    return {
      name: column.name,
      dataField: column.dataField,
      visible: column.visible,
      visibleIndex: column.visibleIndex,
      width: column.width,
      fixed: column.fixed,
      fixedPosition: column.fixedPosition,
    };
  });
}

function visible(grid: Grid) {
  return grid.getVisibleColumns().map((column) => column.name ?? column.dataField ?? column.type);
}

describe('DevExtreme 26.1.4 public layout semantics (native CustomStore)', () => {
  it.each(['columns', 'empty'] as const)('observes native state(partial): %s', async (kind) => {
    const { grid, calls, events, settle } = await queriedGrid();
    const before = queryState(grid);
    const previousCalls = { ...calls };
    const columns = layout(grid).map((column) => ({ ...column, width: 180 }));
    grid.state(kind === 'columns' ? { columns } : {});
    await settle();
    expect(queryState(grid)).toEqual({
      ...before,
      filter: [['id', '>=', 6], 'and', ['rank', '>=', 4]],
      searchText: '',
      pageIndex: 0,
      selectedRowKeys: [],
      selectionFilter: undefined,
      columns:
        kind === 'empty'
          ? before.columns
          : before.columns.map((column) => ({
              ...column,
              sortOrder: undefined,
              sortIndex: undefined,
              groupIndex: undefined,
            })),
    });
    expect(calls).toEqual({ load: previousCalls.load + 1, byKey: previousCalls.byKey });
    expect(events.map((event) => event.fullName)).toEqual([
      'selectedRowKeys',
      'selectedRowKeys',
      'selectionFilter',
      'searchPanel.text',
      'filterValue',
      'paging.pageIndex',
    ]);
    expect(layout(grid).map((column) => column.width)).toEqual([70, '25%', 110, 120]);
  });

  it.each(['native', 'visual'] as const)(
    'restores after runtime query changes: %s',
    async (method) => {
      const { grid, calls, events, settle } = await mount({
        selection: { mode: 'multiple' },
        columns: [
          { dataField: 'id', dataType: 'number' },
          { dataField: 'label', name: 'display', dataType: 'string' },
          { dataField: 'rank', dataType: 'number' },
          { dataField: 'category', dataType: 'string' },
        ],
      });
      grid.beginUpdate();
      try {
        grid.option('filterValue', ['rank', '>=', 4]);
        grid.option('searchPanel.text', 'item');
        grid.option('selectedRowKeys', [6]);
        grid.option('paging.pageSize', 4);
        grid.columnOption('id', { filterValue: 6, selectedFilterOperation: '>=' });
        grid.columnOption('rank', { sortOrder: 'desc', sortIndex: 0 });
        grid.columnOption('category', 'groupIndex', 0);
      } finally {
        grid.endUpdate();
      }
      await settle();
      await grid.pageIndex(1);
      await settle();
      const before = queryState(grid);
      const previousCalls = { ...calls };
      events.length = 0;
      if (method === 'native') {
        grid.state({ columns: layout(grid) });
      } else {
        grid.beginUpdate();
        try {
          grid.columnOption('display', {
            width: '35%',
            visible: false,
            fixed: true,
            fixedPosition: 'sticky',
          });
          grid.columnOption('rank', { width: 180, visibleIndex: 0 });
        } finally {
          grid.endUpdate();
        }
      }
      await settle();
      expect(before.pageIndex).toBe(1);
      expect(before.pageSize).toBe(4);
      expect(before.selectedRowKeys).toEqual([6]);
      if (method === 'native') {
        expect(queryState(grid)).toEqual({
          filterValue: null,
          filter: null,
          searchText: '',
          pageIndex: 0,
          pageSize: 3,
          selectedRowKeys: [],
          selectionFilter: undefined,
          columns: before.columns.map((column) => ({
            ...column,
            sortOrder: undefined,
            sortIndex: undefined,
            groupIndex: undefined,
            filterValue: undefined,
            filterValues: undefined,
          })),
        });
        expect(calls).toEqual({ load: previousCalls.load + 1, byKey: previousCalls.byKey });
        expect(events.map((event) => event.fullName)).toEqual([
          'selectedRowKeys',
          'selectedRowKeys',
          'selectionFilter',
          'searchPanel.text',
          'filterValue',
          'paging.pageIndex',
          'paging.pageSize',
        ]);
      } else {
        expect(queryState(grid)).toEqual(before);
        expect(calls).toEqual(previousCalls);
        expect(events.map((event) => event.fullName)).toEqual([
          'columns[1].width',
          'columns[1].visible',
          'columns[1].fixed',
          'columns[1].fixedPosition',
          'columns[2].width',
          'columns[2].visibleIndex',
        ]);
      }
    }
  );

  it.each([
    { allowed: false, reordering: false },
    { allowed: false, reordering: true },
    { allowed: true, reordering: false },
    { allowed: true, reordering: true },
  ])(
    'native layout restoration: resize=$allowed, reorder=$reordering',
    async ({ allowed, reordering }) => {
      const { grid, calls, events, settle } = await mount({
        allowColumnResizing: allowed,
        allowColumnReordering: reordering,
      });
      const previousCalls = { ...calls };
      const columns = grid.state().columns.map((column: Column<Row, number>, index: number) => ({
        ...column,
        width: index === 1 ? '35%' : 180,
        visibleIndex: 3 - index,
      }));
      grid.state({ columns });
      await settle();
      expect(layout(grid).map((column) => column.width)).toEqual(
        allowed ? [180, '35%', 180, 180] : [70, '25%', 110, 120]
      );
      expect(visible(grid)).toEqual(['category', 'rank', 'display', 'id']);
      expect(calls).toEqual({ load: previousCalls.load + 1, byKey: previousCalls.byKey });
      expect(events.map((event) => event.fullName)).toEqual([
        'selectedRowKeys',
        'selectionFilter',
        'paging.pageIndex',
      ]);
    }
  );

  it('observes visual-only columnOption restore without touching query state', async () => {
    const { grid, calls, events, settle } = await queriedGrid();
    const before = queryState(grid);
    const previousCalls = { ...calls };
    grid.beginUpdate();
    try {
      grid.columnOption('display', {
        width: '35%',
        visible: false,
        fixed: true,
        fixedPosition: 'right',
      });
      grid.columnOption('rank', { width: 180, visibleIndex: 0 });
    } finally {
      grid.endUpdate();
    }
    await settle();
    expect(queryState(grid)).toEqual(before);
    expect(calls).toEqual(previousCalls);
    expect(events.map((event) => [event.name, event.fullName])).toEqual([
      ['columns', 'columns[1].width'],
      ['columns', 'columns[1].visible'],
      ['columns', 'columns[1].fixed'],
      ['columns', 'columns[1].fixedPosition'],
      ['columns', 'columns[2].width'],
      ['columns', 'columns[2].visibleIndex'],
    ]);
  });

  it('observes numeric/string widths and exact column event paths', async () => {
    const { grid, calls, events, settle } = await mount();
    const previousCalls = { ...calls };
    for (const width of [145, '145', '30%', 'auto', undefined]) {
      const previousValue = grid.columnOption('display', 'width');
      events.length = 0;
      grid.columnOption('display', 'width', width);
      await settle();
      expect(grid.columnOption('display', 'width')).toBe(width);
      expect(grid.state().columns[1].width).toBe(width);
      expect(events).toEqual([
        {
          name: 'columns',
          fullName: 'columns[1].width',
          value: width,
          previousValue,
        },
      ]);
    }
    for (const [option, value] of [
      ['visible', false],
      ['visible', true],
      ['fixed', true],
      ['fixedPosition', 'left'],
      ['fixedPosition', 'right'],
      ['fixedPosition', 'sticky'],
      ['visibleIndex', 0],
    ] as const) {
      const previousValue = grid.columnOption('display', option);
      events.length = 0;
      grid.columnOption('display', option, value);
      await settle();
      expect(grid.columnOption('display', option)).toBe(value);
      expect(events).toEqual([
        {
          name: 'columns',
          fullName: `columns[1].${option}`,
          value,
          previousValue,
        },
      ]);
    }
    events.length = 0;
    grid.columnOption('display', { visibleIndex: 0, fixedPosition: 'sticky' });
    await settle();
    expect(events).toEqual([]);
    expect(calls).toEqual(previousCalls);
  });

  it('observes synthesized names, explicit names, and anonymous columns', async () => {
    const { grid, settle } = await mount({
      columns: [
        { dataField: 'id' },
        { dataField: 'label', name: 'display' },
        { name: 'calculated', calculateCellValue: (row) => row.rank * 2 },
        { caption: 'Anonymous', calculateCellValue: (row) => row.rank * 3 },
        { type: 'buttons', name: 'actions' },
      ],
    });
    expect(layout(grid).map(({ name, dataField }) => [name, dataField])).toEqual([
      ['id', 'id'],
      ['display', 'label'],
      ['calculated', undefined],
      [undefined, undefined],
      ['actions', undefined],
    ]);
    expect(grid.state().columns.map((column: Column<Row, number>) => column.name)).toEqual([
      'id',
      'display',
      'calculated',
      undefined,
      'actions',
    ]);
    expect((grid.option('columns') as Column<Row, number>[]).map((column) => column.name)).toEqual([
      'id',
      'display',
      'calculated',
      undefined,
      'actions',
    ]);
    expect(grid.columnOption('Anonymous', 'name')).toBeUndefined();
    expect(grid.columnOption('label', 'name')).toBe('display');
    grid.columnOption('label', 'width', 210);
    await settle();
    expect(grid.columnOption('display', 'width')).toBe(210);
  });

  it('observes name/dataField collisions without treating synthesized names as explicit identities', async () => {
    const { grid, settle } = await mount({
      columns: [
        { name: 'label', dataField: 'id' },
        { name: 'display', dataField: 'label' },
        { name: 'second', dataField: 'label' },
      ],
    });
    grid.columnOption('label', 'width', 210);
    await settle();
    expect(grid.columnCount()).toBe(3);
    expect(layout(grid).map((column) => column.width)).toEqual([210, undefined, undefined]);
    grid.columnOption('second', 'width', 220);
    await settle();
    expect(layout(grid).map((column) => column.width)).toEqual([210, undefined, 220]);
  });

  it.each([false, true])(
    'public command enumeration with explicit buttons: %s',
    async (explicit) => {
      const { grid } = await mount({
        selection: { mode: 'multiple', showCheckBoxesMode: 'always' },
        rowDragging: { allowReordering: true },
        editing: { mode: 'row', allowUpdating: true, allowDeleting: true },
        masterDetail: { enabled: true, template: () => document.createElement('span') },
        columns: [
          { dataField: 'id' },
          { dataField: 'category', groupIndex: 0 },
          { dataField: 'label', visible: false },
          ...(explicit
            ? [
                { type: 'buttons', name: 'actions', buttons: ['edit', 'delete'] } as Column<
                  Row,
                  number
                >,
              ]
            : []),
        ],
      });
      expect(grid.columnCount()).toBe(explicit ? 4 : 3);
      expect(layout(grid).map((column) => column.name)).toEqual(
        explicit ? ['id', 'category', 'label', 'actions'] : ['id', 'category', 'label']
      );
      expect(grid.state().columns).toHaveLength(explicit ? 4 : 3);
      expect(grid.getVisibleColumns().map((column) => [column.name, column.type])).toEqual([
        [undefined, 'drag'],
        [undefined, 'selection'],
        ['category', 'groupExpand'],
        [undefined, 'detailExpand'],
        ['id', undefined],
        [explicit ? 'actions' : undefined, 'buttons'],
      ]);
    }
  );

  it.each(['fix-first', 'index-first', 'reverse-index'] as const)(
    'observes fixed/order application: %s',
    async (order) => {
      const { grid, calls, events, settle } = await mount({
        columns: [
          { name: 'a', dataField: 'id' },
          { name: 'b', dataField: 'label' },
          { name: 'c', dataField: 'rank' },
          { name: 'd', dataField: 'category' },
          { name: 'e', dataField: 'extra' },
        ],
      });
      const target: Column<Row, number>[] = [
        { name: 'e', fixed: true, fixedPosition: 'right', visibleIndex: 0 },
        { name: 'c', fixed: true, fixedPosition: 'sticky', visibleIndex: 1 },
        { name: 'a', fixed: true, fixedPosition: 'left', visibleIndex: 2 },
        { name: 'd', fixed: false, visibleIndex: 3 },
        { name: 'b', fixed: true, fixedPosition: 'right', visibleIndex: 4 },
      ];
      const previousCalls = { ...calls };
      const fix = () =>
        target.forEach(({ name, fixed, fixedPosition }) => {
          grid.columnOption(name!, { fixed, fixedPosition });
        });
      const index = () =>
        (order === 'reverse-index' ? [...target].reverse() : target).forEach(
          ({ name, visibleIndex }) => grid.columnOption(name!, 'visibleIndex', visibleIndex)
        );
      grid.beginUpdate();
      try {
        if (order === 'index-first') {
          index();
          fix();
        } else {
          fix();
          index();
        }
      } finally {
        grid.endUpdate();
      }
      await settle();
      expect(
        layout(grid).map(({ name, visibleIndex, fixed, fixedPosition }) => ({
          name,
          visibleIndex,
          fixed,
          fixedPosition,
        }))
      ).toEqual(
        ['a', 'b', 'c', 'd', 'e'].map((name) => ({
          fixedPosition: undefined,
          ...target.find((column) => column.name === name),
        }))
      );
      expect(visible(grid)).toEqual(['a', 'c', 'd', 'e', 'b']);
      expect(
        events
          .filter((event) => event.fullName.endsWith('.visibleIndex'))
          .map((event) => [event.fullName, event.value])
      ).toEqual(
        order === 'reverse-index'
          ? [
              ['columns[1].visibleIndex', 3],
              ['columns[3].visibleIndex', 2],
              ['columns[0].visibleIndex', 1],
              ['columns[2].visibleIndex', 0],
              ['columns[4].visibleIndex', 0],
            ]
          : [
              ['columns[4].visibleIndex', 0],
              ['columns[2].visibleIndex', 1],
              ['columns[3].visibleIndex', 3],
            ]
      );
      expect(calls).toEqual(previousCalls);
    }
  );

  it.each(['saved-only', 'merged-order'] as const)(
    'observes new-column default positions: %s',
    async (method) => {
      const { grid, calls, settle } = await mount({
        columns: [
          { name: 'a', dataField: 'id' },
          { name: 'new', dataField: 'extra' },
          { name: 'b', dataField: 'label' },
          { name: 'c', dataField: 'rank' },
          { name: 'tail', dataField: 'category' },
        ],
      });
      const previousCalls = { ...calls };
      const saved = ['c', 'a', 'b'];
      const target = method === 'saved-only' ? saved : ['c', 'new', 'a', 'b', 'tail'];
      grid.beginUpdate();
      try {
        target.forEach((name, index) => grid.columnOption(name, 'visibleIndex', index));
      } finally {
        grid.endUpdate();
      }
      await settle();
      expect(visible(grid)).toEqual(
        method === 'saved-only' ? ['c', 'a', 'b', 'new', 'tail'] : ['c', 'new', 'a', 'b', 'tail']
      );
      expect(grid.columnOption('new', 'visibleIndex')).toBe(method === 'saved-only' ? 3 : 1);
      expect(grid.columnOption('tail', 'visibleIndex')).toBe(4);
      expect(calls).toEqual(previousCalls);
    }
  );
});
