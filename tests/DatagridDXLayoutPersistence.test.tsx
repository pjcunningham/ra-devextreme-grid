import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AdminContext,
  ListBase,
  ListContextProvider,
  StoreContextProvider,
  TestMemoryRouter,
  memoryStore,
  testDataProvider,
  type ListControllerResult,
} from 'react-admin';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import type dxDataGrid from 'devextreme/ui/data_grid';
import {
  DatagridDX,
  DatagridDXRemote,
  type DatagridDXProps,
  type DatagridDXRemoteProps,
  type GetGridParams,
} from '../src';

type Row = { id: number; company: string; country: string; city: string };
const records: Row[] = [
  { id: 1, company: 'Acme', country: 'UK', city: 'London' },
  { id: 2, company: 'Beta', country: 'UK', city: 'York' },
];
const columns = [
  { dataField: 'id', dataType: 'number' as const },
  { dataField: 'company', dataType: 'string' as const },
  { dataField: 'country', dataType: 'string' as const },
  { dataField: 'city', dataType: 'string' as const },
];
const preferenceKey = 'customers.list.layout';
const saved = {
  version: 1,
  columns: [
    {
      key: 'company',
      visible: false,
      visibleIndex: 1,
      width: 240,
      fixed: true,
      fixedPosition: 'right',
    },
    { key: 'country', visible: false, visibleIndex: 2 },
    { key: 'city', visible: true, visibleIndex: 0 },
    { key: 'id', visible: true, visibleIndex: 3 },
  ],
};

function listContext() {
  return {
    data: records,
    total: 2,
    isPending: false,
    isFetching: false,
    isLoading: false,
    resource: 'customers',
    sort: { field: 'company', order: 'ASC' },
    filterValues: { country: 'UK' },
    displayedFilters: {},
    selectedIds: [1],
    page: 3,
    perPage: 25,
    setPage: vi.fn(),
    setPerPage: vi.fn(),
    setSort: vi.fn(),
    setFilters: vi.fn(),
    onSelect: vi.fn(),
  } as unknown as ListControllerResult<Row>;
}

function mountManaged(initialValue: unknown = saved, initialProps: DatagridDXProps<Row> = {}) {
  const store = memoryStore({ [preferenceKey]: initialValue });
  const write = vi.spyOn(store, 'setItem');
  const context = listContext();
  const ref = createRef<DataGridRef<Row, number>>();
  const view = (props: DatagridDXProps<Row>, generation = 0) => (
    <StoreContextProvider value={store}>
      <ListContextProvider value={context}>
        <DatagridDX<Row>
          key={generation}
          ref={ref}
          layoutPreferenceKey={preferenceKey}
          columns={columns}
          filtering
          selection
          {...props}
        />
      </ListContextProvider>
    </StoreContextProvider>
  );
  const mounted = render(view(initialProps));
  return {
    ...mounted,
    store,
    write,
    context,
    ref,
    grid: () => ref.current!.instance(),
    rerender: (props: DatagridDXProps<Row>, generation = 0) =>
      mounted.rerender(view(props, generation)),
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260));
  });
}

describe('managed visual persistence', () => {
  it('restores hidden filtered/sorted columns without any React-Admin query or selection mutation', async () => {
    const h = mountManaged();
    await waitFor(() => expect(h.grid().columnOption('company', 'visible')).toBe(false));
    expect(h.grid().columnOption('country', 'visible')).toBe(false);
    expect(h.grid().columnOption('company', 'sortOrder')).toBe('asc');
    expect(h.grid().option('filterValue')).toEqual(['country', '=', 'UK']);
    expect(h.grid().option('selectedRowKeys')).toEqual([1]);
    expect(h.grid().option('dataSource')).toEqual(records);
    expect(h.context.data).toBe(records);
    expect(h.grid().columnOption('company', 'width')).toBe(240);
    expect(h.grid().columnOption('company', 'fixedPosition')).toBe('right');
    await settle();
    for (const callback of [
      'setPage',
      'setPerPage',
      'setSort',
      'setFilters',
      'onSelect',
    ] as const) {
      expect(h.context[callback]).not.toHaveBeenCalled();
    }
    expect(h.write).not.toHaveBeenCalled();
    expect(h.grid().option('stateStoring.enabled')).toBe(false);
  });

  it('keeps the forwarded ref and delivers each native callback exactly once', async () => {
    const onOptionChanged = vi.fn();
    const onContentReady = vi.fn();
    const onDisposing = vi.fn();
    const h = mountManaged(undefined, { onOptionChanged, onContentReady, onDisposing });
    await waitFor(() => expect(onContentReady).toHaveBeenCalled());
    const nativeReady = vi.fn();
    h.grid().on('contentReady', nativeReady);
    onContentReady.mockClear();
    onOptionChanged.mockClear();
    const nativeChanged = vi.fn();
    h.grid().on('optionChanged', nativeChanged);
    act(() => h.ref.current!.instance().columnOption('city', 'width', 215));
    await settle();
    expect(onOptionChanged.mock.calls.map(([event]) => event.fullName)).toEqual(
      nativeChanged.mock.calls.map(([event]) => event.fullName)
    );
    expect(
      onOptionChanged.mock.calls.filter(([event]) => event.fullName === 'columns[3].width')
    ).toHaveLength(1);
    expect(onContentReady).toHaveBeenCalledTimes(nativeReady.mock.calls.length);
    h.unmount();
    expect(onDisposing).toHaveBeenCalledTimes(1);
  });

  it('persists a complete debounced snapshot with no query fields', async () => {
    const h = mountManaged(null);
    await settle();
    expect(h.write).not.toHaveBeenCalled();
    act(() => {
      h.grid().beginUpdate();
      h.grid().columnOption('city', 'visible', false);
      h.grid().columnOption('country', 'visibleIndex', 0);
      h.grid().columnOption('company', 'width', 177);
      h.grid().columnOption('company', 'fixed', true);
      h.grid().columnOption('company', 'fixedPosition', 'sticky');
      h.grid().endUpdate();
    });
    expect(h.write).not.toHaveBeenCalled();
    await waitFor(() => expect(h.write).toHaveBeenCalledTimes(1));
    const stored = h.store.getItem<{ version: number; columns: Record<string, unknown>[] }>(
      preferenceKey
    )!;
    expect(stored.version).toBe(1);
    expect(stored.columns.map((column) => column.key)).toEqual([
      'city',
      'company',
      'country',
      'id',
    ]);
    expect(stored.columns.find((column) => column.key === 'city')).toMatchObject({
      visible: false,
    });
    expect(stored.columns.find((column) => column.key === 'company')).toMatchObject({
      width: 177,
      fixed: true,
      fixedPosition: 'sticky',
    });
    expect(stored.columns.find((column) => column.key === 'country')?.visibleIndex).toBe(
      h.grid().columnOption('country', 'visibleIndex')
    );
    for (const column of stored.columns) {
      expect(
        Object.keys(column).every((key) =>
          ['key', 'visible', 'visibleIndex', 'width', 'fixed', 'fixedPosition'].includes(key)
        )
      ).toBe(true);
    }
    expect(Object.keys(stored)).toEqual(['version', 'columns']);
  });

  it('does not subscribe/read/write when the key is absent', async () => {
    const store = memoryStore();
    const read = vi.spyOn(store, 'getItem');
    const write = vi.spyOn(store, 'setItem');
    const subscribe = vi.spyOn(store, 'subscribe');
    const ref = createRef<DataGridRef<Row, number>>();
    render(
      <StoreContextProvider value={store}>
        <ListContextProvider value={listContext()}>
          <DatagridDX<Row> ref={ref} columns={columns} />
        </ListContextProvider>
      </StoreContextProvider>
    );
    act(() => ref.current!.instance().columnOption('city', 'visible', false));
    await settle();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it.each([null, 'legacy', { version: 2, columns: saved.columns }, { version: 1, columns: {} }])(
    'ignores malformed/old preferences without rewriting %#',
    async (value) => {
      const h = mountManaged(value);
      await settle();
      expect(h.grid().columnOption('city', 'visible')).toBe(true);
      expect(h.grid().columnOption('company', 'width')).toBeUndefined();
      expect(h.write).not.toHaveBeenCalled();
    }
  );

  it('retains new column default slots while ignoring removed and renamed identities', async () => {
    const h = mountManaged(
      {
        version: 1,
        columns: [
          { key: 'removed', visible: false, visibleIndex: 1 },
          { key: 'country', visibleIndex: 0 },
          { key: 'company', visibleIndex: 2 },
          { key: 'id', visibleIndex: 3 },
        ],
      },
      {
        columns: [
          columns[0]!,
          { dataField: 'newColumn', width: 123 },
          columns[1]!,
          columns[2]!,
          { dataField: 'renamedCity' },
        ],
      }
    );
    await settle();
    expect(
      h
        .grid()
        .getVisibleColumns()
        .map((column) => column.dataField)
    ).toEqual([undefined, 'country', 'newColumn', 'company', 'id', 'renamedCity']);
    expect(h.grid().columnOption('newColumn', 'width')).toBe(123);
    expect(h.grid().columnOption('newColumn', 'visible')).toBe(true);
    expect(h.grid().columnOption('renamedCity', 'visible')).toBe(true);
    expect(h.write).not.toHaveBeenCalled();
  });

  it('applies external preferences once and removal resets only after remount', async () => {
    const h = mountManaged(null);
    act(() => h.store.setItem(preferenceKey, saved));
    await waitFor(() => expect(h.grid().columnOption('city', 'visibleIndex')).toBe(0));
    await settle();
    expect(h.write).toHaveBeenCalledTimes(1);
    act(() => h.store.removeItem(preferenceKey));
    expect(h.grid().columnOption('company', 'visible')).toBe(false);
    h.rerender({}, 1);
    await waitFor(() => expect(h.grid().columnOption('company', 'visible')).toBe(true));
    expect(h.grid().columnOption('company', 'width')).toBeUndefined();
  });

  it('shares exact keys across compatible grids but isolates another key for the same resource', async () => {
    const store = memoryStore();
    const refs = [0, 1, 2].map(() => createRef<DataGridRef<Row, number>>());
    const keys = ['shared.layout', 'shared.layout', 'separate.layout'];
    render(
      <StoreContextProvider value={store}>
        <ListContextProvider value={listContext()}>
          {refs.map((ref, index) => (
            <DatagridDX<Row>
              key={index}
              ref={ref}
              columns={columns}
              layoutPreferenceKey={keys[index]}
            />
          ))}
        </ListContextProvider>
      </StoreContextProvider>
    );
    const write = vi.spyOn(store, 'setItem');
    await settle();
    act(() => refs[0]!.current!.instance().columnOption('city', 'visible', false));
    await waitFor(() =>
      expect(refs[1]!.current!.instance().columnOption('city', 'visible')).toBe(false)
    );
    expect(refs[2]!.current!.instance().columnOption('city', 'visible')).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0]).toBe('shared.layout');
    expect(store.getItem('separate.layout')).toBeUndefined();
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('adds no getList request while restoring a real ListBase', async () => {
    const getList = vi.fn().mockResolvedValue({ data: records, total: 2 });
    const provider = { ...testDataProvider(), getList };
    const ref = createRef<DataGridRef<Row, number>>();
    render(
      <TestMemoryRouter initialEntries={['/customers']}>
        <AdminContext dataProvider={provider} store={memoryStore({ [preferenceKey]: saved })}>
          <ListBase
            resource="customers"
            perPage={25}
            sort={{ field: 'company', order: 'ASC' }}
            filter={{ country: 'UK' }}
          >
            <DatagridDX<Row>
              ref={ref}
              columns={columns}
              layoutPreferenceKey={preferenceKey}
              filtering
            />
          </ListBase>
        </AdminContext>
      </TestMemoryRouter>
    );
    await waitFor(() =>
      expect(ref.current!.instance().columnOption('company', 'visible')).toBe(false)
    );
    await settle();
    expect(getList).toHaveBeenCalledTimes(1);
    expect(getList).toHaveBeenCalledWith(
      'customers',
      expect.objectContaining({
        pagination: { page: 1, perPage: 25 },
        sort: { field: 'company', order: 'ASC' },
        filter: { country: 'UK' },
      })
    );
  });
});

describe('remote visual persistence', () => {
  it('restores only visual fields without loads, ref replacement or request-shape changes', async () => {
    const getGrid = vi.fn(async (_resource: string, { loadOptions }: GetGridParams) => ({
      data: records,
      ...(loadOptions.requireTotalCount ? { totalCount: 2 } : {}),
    }));
    const getList = vi.fn();
    const provider = { ...testDataProvider(), getGrid, getList };
    const store = memoryStore({
      [preferenceKey]: {
        ...saved,
        filterValue: ['country', '=', 'USA'],
        paging: { pageIndex: 7, pageSize: 100 },
        selectedRowKeys: [99],
        groupPagingContext: { filter: [] },
        columns: saved.columns.map((column) => ({
          ...column,
          sortOrder: 'desc',
          groupIndex: 0,
          filterValue: 'USA',
        })),
      },
    });
    const write = vi.spyOn(store, 'setItem');
    const ref = createRef<DataGridRef<Row, number>>();
    const onContentReady = vi.fn();
    const onOptionChanged = vi.fn();
    const view = (props: DatagridDXRemoteProps<Row> = {}) => (
      <AdminContext dataProvider={provider} store={store}>
        <DatagridDXRemote<Row>
          resource="customers"
          columns={columns}
          paging={{ pageSize: 10 }}
          layoutPreferenceKey={preferenceKey}
          ref={ref}
          onContentReady={onContentReady}
          onOptionChanged={onOptionChanged}
          {...props}
        />
      </AdminContext>
    );
    const rendered = render(view());
    await waitFor(() => expect(onContentReady).toHaveBeenCalled());
    await waitFor(() =>
      expect(ref.current!.instance().columnOption('city', 'visibleIndex')).toBe(0)
    );
    await settle();
    const grid = ref.current!.instance();
    const customStore = grid.getDataSource().store();
    expect(getGrid).toHaveBeenCalledTimes(1);
    const initialRequest = getGrid.mock.calls[0]![1];
    expect(initialRequest.loadOptions).toEqual({ skip: 0, take: 10, requireTotalCount: true });
    expect(grid.columnOption('company', 'sortOrder')).toBeUndefined();
    expect(grid.columnOption('country', 'groupIndex')).toBeUndefined();
    expect(grid.option('filterValue')).toBeNull();
    expect(grid.option('selectedRowKeys')).toEqual([]);
    expect(write).not.toHaveBeenCalled();
    onOptionChanged.mockClear();
    act(() => grid.columnOption('city', 'width', 199));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    expect(
      onOptionChanged.mock.calls.filter(([event]) => event.fullName === 'columns[3].width')
    ).toHaveLength(1);
    rendered.rerender(view({ showBorders: true }));
    await settle();
    expect(ref.current!.instance()).toBe(grid);
    expect(grid.getDataSource().store()).toBe(customStore);
    expect(getGrid).toHaveBeenCalledTimes(1);
    await act(async () => {
      await grid.refresh();
    });
    expect(getGrid.mock.calls.at(-1)![1]).toEqual(initialRequest);
    expect(getList).not.toHaveBeenCalled();
  });

  it('restores with JSX columns and keeps lazy grouping and both summary scopes working', async () => {
    const getGrid = vi.fn(async (_resource: string, { loadOptions }: GetGridParams) => ({
      data: loadOptions.group ? [{ key: 'UK', items: null, count: 2, summary: [2] }] : records,
      ...(loadOptions.requireTotalCount ? { totalCount: 2 } : {}),
      ...(loadOptions.requireGroupCount ? { groupCount: 1 } : {}),
      ...(loadOptions.totalSummary ? { summary: [2] } : {}),
    }));
    const provider = { ...testDataProvider(), getGrid };
    const store = memoryStore({ [preferenceKey]: saved });
    const ref = createRef<DataGridRef<Row, number>>();
    const errors = vi.fn();
    render(
      <AdminContext dataProvider={provider} store={store}>
        <DatagridDXRemote
          ref={ref}
          resource="customers"
          layoutPreferenceKey={preferenceKey}
          groupPaging
          grouping={{ autoExpandAll: false }}
          paging={{ pageSize: 5 }}
          onDataErrorOccurred={errors}
          summary={{
            totalItems: [{ name: 'count', column: 'id', summaryType: 'count' }],
            groupItems: [{ column: 'id', summaryType: 'count' }],
          }}
        >
          <Column dataField="id" autoExpandGroup={false} />
          <Column dataField="company" autoExpandGroup={false} />
          <Column dataField="country" groupIndex={0} autoExpandGroup={false} />
          <Column dataField="city" autoExpandGroup={false} />
        </DatagridDXRemote>
      </AdminContext>
    );
    await waitFor(() => expect(ref.current!.instance().getVisibleRows()).toHaveLength(1));
    await settle();
    const grid = ref.current!.instance() as unknown as dxDataGrid<Row, number | string[]>;
    expect(getGrid).toHaveBeenCalledTimes(1);
    expect(grid.getTotalSummaryValue('count')).toBe(2);
    expect(grid.columnOption('country', 'groupIndex')).toBe(0);
    await act(async () => {
      await grid.expandRow(['UK']);
    });
    await waitFor(() =>
      expect(grid.getVisibleRows().filter((row) => row.rowType === 'data')).toHaveLength(2)
    );
    expect(getGrid.mock.calls.at(-1)![1].loadOptions.groupPagingContext?.group).toEqual([
      { selector: 'country', desc: false, isExpanded: false },
    ]);
    act(() => grid.columnOption('city', 'width', 133));
    await settle();
    const value = store.getItem(preferenceKey);
    expect(JSON.stringify(value)).not.toMatch(
      /groupIndex|groupPagingContext|summary|expanded|filter|sort/
    );
    expect(errors).not.toHaveBeenCalled();
  });
});
