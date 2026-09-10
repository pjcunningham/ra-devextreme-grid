import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import {
  AdminContext,
  ListBase,
  ListContextProvider,
  type DataProvider,
  type ListControllerResult,
  type RaRecord,
} from 'react-admin';
import { DatagridDX } from '../src/index';

function createMockListContext<RecordType extends RaRecord = RaRecord>(
  overrides?: Partial<ListControllerResult<RecordType>>
): ListControllerResult<RecordType> {
  const base = {
    data: [] as RecordType[],
    total: 0,
    isPending: false,
    isFetching: false,
    isLoading: false,
    page: 1,
    setPage: vi.fn(),
    perPage: 10,
    setPerPage: vi.fn(),
    sort: { field: 'id', order: 'ASC' as const },
    setSort: vi.fn(),
    filterValues: {},
    setFilters: vi.fn(),
    displayedFilters: {},
    showFilter: vi.fn(),
    hideFilter: vi.fn(),
    selectedIds: [],
    onSelect: vi.fn(),
    onSelectAll: vi.fn(),
    onToggleItem: vi.fn(),
    onUnselectItems: vi.fn(),
    resource: 'items',
    refetch: vi.fn().mockResolvedValue(undefined),
    error: null,
    hasNextPage: false,
    hasPreviousPage: false,
    ...overrides,
  };
  return base as unknown as ListControllerResult<RecordType>;
}

interface Customer extends RaRecord {
  id: number;
  name: string;
  email: string;
}

interface StringIdRecord extends RaRecord<string> {
  id: string;
  title: string;
}

describe('DatagridDX component (Phase 1 Managed Grid)', () => {
  it('Scenario A: renders records provided by React-Admin ListContext without direct data props', async () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice Smith', email: 'alice@example.com' },
      { id: 2, name: 'Bob Jones', email: 'bob@example.com' },
    ];
    const contextValue = createMockListContext<Customer>({ data: records, total: 2 });

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer>>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(await screen.findByText('Bob Jones')).toBeInTheDocument();
  });

  it('Scenario B: supports generic custom record types extending RaRecord', async () => {
    const records: Customer[] = [{ id: 101, name: 'Typed User', email: 'typed@example.com' }];
    const contextValue = createMockListContext<Customer>({ data: records, total: 1 });

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer>>
          <Column dataField="name" caption="Customer Name" />
          <Column dataField="email" caption="Customer Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('Typed User')).toBeInTheDocument();
    expect(await screen.findByText('typed@example.com')).toBeInTheDocument();
  });

  it('Scenario C: handles string identifiers correctly with canonical record.id row keys', async () => {
    const records: StringIdRecord[] = [
      { id: 'cust-alpha', title: 'First String Entry' },
      { id: 'cust-beta', title: 'Second String Entry' },
    ];
    const contextValue = createMockListContext<StringIdRecord>({ data: records, total: 2 });
    const gridRef = createRef<DataGridRef<StringIdRecord, string>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<StringIdRecord> ref={gridRef}>
          <Column dataField="id" caption="Identifier" />
          <Column dataField="title" caption="Title" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('cust-alpha')).toBeInTheDocument();
    expect(await screen.findByText('Second String Entry')).toBeInTheDocument();

    const instance = gridRef.current?.instance();
    expect(instance?.option('keyExpr')).toBe('id');
    expect(instance?.keyOf(records[0]!)).toBe('cust-alpha');
  });

  it('Scenario D: handles initial pending state without throwing or flashing "No data"', () => {
    const contextValue = createMockListContext<Customer>({
      data: undefined,
      isPending: true,
      isFetching: true,
      isLoading: true,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { container } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} noDataText="Custom No Data">
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(container.querySelector('.dx-datagrid')).toBeInTheDocument();
    // Verify "No data" / custom text is suppressed during pending state
    expect(screen.queryByText('Custom No Data')).not.toBeInTheDocument();
    expect(screen.queryByText('No data')).not.toBeInTheDocument();

    const instance = gridRef.current?.instance();
    expect(instance?.option('noDataText')).toBe('');
  });

  it('Scenario E: displays configured noDataText when loaded with an empty data array', () => {
    const contextValue = createMockListContext<Customer>({
      data: [],
      isPending: false,
      isFetching: false,
      total: 0,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} noDataText="No records available">
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('noDataText')).toBe('No records available');
  });

  it('Scenario E (default): defaults noDataText to "No data" when not specified', () => {
    const contextValue = createMockListContext<Customer>({
      data: [],
      isPending: false,
      isFetching: false,
      total: 0,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('noDataText')).toBe('No data');
  });

  it('Scenario F: preserves existing rendered rows during background fetching', async () => {
    const initialRecords: Customer[] = [
      { id: 1, name: 'Persisted Record', email: 'persisted@example.com' },
    ];
    const contextValue = createMockListContext<Customer>({
      data: initialRecords,
      isPending: false,
      isFetching: true, // background refetch
      total: 1,
    });

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer>>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    // Existing rows must remain visible during background refetch
    expect(await screen.findByText('Persisted Record')).toBeInTheDocument();
  });

  it('Scenario G: forwards harmless native DevExtreme props', () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Props Test', email: 'props@example.com' }],
      total: 1,
    });

    const { container } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> showBorders={true} showRowLines={true}>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const grid = container.querySelector('.dx-datagrid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass('dx-datagrid-borders');
  });

  it('Scenario H: projects child Column configurations with custom captions', async () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
    });

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer>>
          <Column dataField="name" caption="Client Full Name" />
          <Column dataField="email" caption="Client Primary Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('Client Full Name')).toBeInTheDocument();
    expect(await screen.findByText('Client Primary Email')).toBeInTheDocument();
  });

  it('Scenario I: verifies React-Admin is the single data fetch owner', async () => {
    const getListSpy = vi.fn().mockResolvedValue({
      data: [{ id: 1, name: 'Single Owner Record' }],
      total: 1,
    });

    const dataProvider: DataProvider = {
      getList: getListSpy,
      getOne: vi.fn(),
      getMany: vi.fn(),
      getManyReference: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };

    render(
      <AdminContext dataProvider={dataProvider}>
        <ListBase resource="customers">
          <DatagridDX>
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListBase>
      </AdminContext>
    );

    expect(await screen.findByText('Single Owner Record')).toBeInTheDocument();
    // React-Admin's List controller must call getList exactly once, and DatagridDX must not make any fetch
    expect(getListSpy).toHaveBeenCalledTimes(1);
    expect(getListSpy).toHaveBeenCalledWith('customers', expect.anything());
  });

  it('Scenario J: enforces data-shaping safeguards (paging.enabled = false, sorting.mode = "single")', () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Safeguard Test', email: 'safe@example.com' }],
      total: 1,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const overrideProps = {
      paging: { enabled: true },
      sorting: { mode: 'multiple' },
    } as unknown as Record<string, unknown>;

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} {...overrideProps}>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('paging.enabled')).toBe(false);
    expect(instance?.option('sorting.mode')).toBe('single');
  });

  it('exposes imperative instance via forwarded ref', () => {
    const contextValue = createMockListContext<Customer>({ data: [], total: 0 });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(gridRef.current).not.toBeNull();
    expect(typeof gridRef.current?.instance).toBe('function');
    expect(gridRef.current?.instance().option('keyExpr')).toBe('id');
  });

  it('throws descriptive error if rendered outside of ListContextProvider', () => {
    // Suppress console.error for expected React render error
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(
        <DatagridDX>
          <Column dataField="name" />
        </DatagridDX>
      );
    }).toThrow(/useListContext must be used inside a ListContextProvider/);

    spy.mockRestore();
  });
});

describe('DatagridDX managed single-column sorting (Phase 2)', () => {
  it('Scenario H: renders ascending sort indicator when context sort is ASC', async () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { container } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    const instance = gridRef.current?.instance();
    expect(instance?.columnOption('name', 'sortOrder')).toBe('asc');
    expect(
      container.querySelector(
        '.dx-header-row td.dx-sort-up, .dx-header-row td .dx-sort-up, .dx-header-row td[aria-sort="ascending"]'
      )
    ).not.toBeNull();
  });

  it('Scenario I: renders descending sort indicator when context sort is DESC', async () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'DESC' },
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { container } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    const instance = gridRef.current?.instance();
    expect(instance?.columnOption('name', 'sortOrder')).toBe('desc');
    expect(
      container.querySelector(
        '.dx-header-row td.dx-sort-down, .dx-header-row td .dx-sort-down, .dx-header-row td[aria-sort="descending"]'
      )
    ).not.toBeNull();
  });

  it('Scenario J: user clicking unsorted column calls setSort({ field, order: "ASC" }) once', () => {
    const setSort = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
      setSort,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance).toBeDefined();

    // Trigger sort on unsorted column 'email' (index 1)
    act(() => {
      instance?.columnOption(1, 'sortOrder', 'asc');
    });

    expect(setSort).toHaveBeenCalledTimes(1);
    expect(setSort).toHaveBeenCalledWith({ field: 'email', order: 'ASC' });
  });

  it('Scenario K: user clicking already-sorted column toggles direction to DESC', () => {
    const setSort = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
      setSort,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance).toBeDefined();

    // Trigger toggle on column 'name' (index 0) from asc to desc
    act(() => {
      instance?.columnOption(0, 'sortOrder', 'desc');
    });

    expect(setSort).toHaveBeenCalledTimes(1);
    expect(setSort).toHaveBeenCalledWith({ field: 'name', order: 'DESC' });
  });

  it('Scenario L: external sort change in React-Admin updates DevExtreme column indicator without calling setSort', () => {
    const setSort = vi.fn();
    const initialContext = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
      setSort,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { rerender } = render(
      <ListContextProvider value={initialContext}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.columnOption('name', 'sortOrder')).toBe('asc');
    expect(instance?.columnOption('email', 'sortOrder')).toBeUndefined();
    expect(setSort).not.toHaveBeenCalled();

    // External change (e.g. URL update or external sort control)
    const updatedContext = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'email', order: 'DESC' },
      setSort,
    });

    rerender(
      <ListContextProvider value={updatedContext}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(instance?.columnOption('name', 'sortOrder')).toBeUndefined();
    expect(instance?.columnOption('email', 'sortOrder')).toBe('desc');
    // Crucial: programmatic update must NOT cause setSort to fire!
    expect(setSort).not.toHaveBeenCalled();
  });

  it('Scenario M: single-column constraint ensures only one column is actively sorted', () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'email', order: 'ASC' },
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="id" caption="ID" />
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('sorting.mode')).toBe('single');

    const columnSortOrders = [0, 1, 2]
      .map((i) => instance?.columnOption(i, 'sortOrder'))
      .filter(Boolean);

    expect(columnSortOrders).toEqual(['asc']);
  });

  it('Scenario N: non-sortable column (allowSorting = false) does not trigger setSort', () => {
    const setSort = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
      setSort,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" allowSorting={false} />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();

    act(() => {
      instance?.columnOption(1, 'sortOrder', 'asc');
    });

    expect(setSort).not.toHaveBeenCalled();
  });

  it('Scenario O: column without valid dataField does not trigger setSort', () => {
    const setSort = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
      setSort,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column caption="Actions" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();

    act(() => {
      instance?.columnOption(1, 'sortOrder', 'asc');
    });

    expect(setSort).not.toHaveBeenCalled();
  });

  it('Scenario P: consumer onOptionChanged runs alongside internal sort handler and receives original event', () => {
    const setSort = vi.fn();
    const onOptionChanged = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
      setSort,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} onOptionChanged={onOptionChanged}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();

    act(() => {
      instance?.columnOption(1, 'sortOrder', 'asc');
    });

    expect(setSort).toHaveBeenCalledWith({ field: 'email', order: 'ASC' });
    expect(onOptionChanged).toHaveBeenCalled();
    const eventArg = onOptionChanged.mock.calls[0]?.[0];
    expect(eventArg).toHaveProperty('component');
    expect(eventArg).toHaveProperty('name');
  });

  it('Scenario Q: feedback-loop guard prevents recursive setSort calls', () => {
    const setSort = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      sort: { field: 'name', order: 'ASC' },
      setSort,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { rerender } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(setSort).not.toHaveBeenCalled();

    // Re-render multiple times with the same sort
    rerender(
      <ListContextProvider value={{ ...contextValue }}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    rerender(
      <ListContextProvider value={{ ...contextValue }}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(setSort).not.toHaveBeenCalled();
  });

  it('Server-Order Invariant: grid renders records in the exact order supplied by React-Admin ListContext', async () => {
    // Initial page of records from server: order is [Zoe, Adam] (e.g. sorted by a different server rule)
    const initialRecords: Customer[] = [
      { id: 1, name: 'Zoe', email: 'zoe@example.com' },
      { id: 2, name: 'Adam', email: 'adam@example.com' },
    ];
    const initialContext = createMockListContext<Customer>({
      data: initialRecords,
      total: 2,
      sort: { field: 'id', order: 'ASC' },
    });

    const { rerender, container } = render(
      <ListContextProvider value={initialContext}>
        <DatagridDX<Customer>>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('Zoe')).toBeInTheDocument();
    expect(await screen.findByText('Adam')).toBeInTheDocument();

    const rows = container.querySelectorAll('.dx-data-row td:first-child');
    expect(rows[0]?.textContent).toBe('Zoe');
    expect(rows[1]?.textContent).toBe('Adam');

    // Server responds with new sorted page: order is [Adam, Zoe]
    const sortedRecords: Customer[] = [
      { id: 2, name: 'Adam', email: 'adam@example.com' },
      { id: 1, name: 'Zoe', email: 'zoe@example.com' },
    ];
    const updatedContext = createMockListContext<Customer>({
      data: sortedRecords,
      total: 2,
      sort: { field: 'name', order: 'ASC' },
    });

    rerender(
      <ListContextProvider value={updatedContext}>
        <DatagridDX<Customer>>
          <Column dataField="name" caption="Name" />
          <Column dataField="email" caption="Email" />
        </DatagridDX>
      </ListContextProvider>
    );

    await waitFor(() => {
      const updatedRows = container.querySelectorAll('.dx-data-row td:first-child');
      expect(updatedRows[0]?.textContent).toBe('Adam');
      expect(updatedRows[1]?.textContent).toBe('Zoe');
    });
  });

  it('handles context sort on a field that is not rendered as a column gracefully', () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Alice', email: 'alice@example.com' }],
      total: 1,
      // Sort by a field that is not rendered
      sort: { field: 'nonExistentField', order: 'ASC' },
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    expect(() => {
      render(
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> ref={gridRef}>
            <Column dataField="name" caption="Name" />
            <Column dataField="email" caption="Email" />
          </DatagridDX>
        </ListContextProvider>
      );
    }).not.toThrow();

    const instance = gridRef.current?.instance();
    expect(instance?.columnOption(0, 'sortOrder')).toBeUndefined();
    expect(instance?.columnOption(1, 'sortOrder')).toBeUndefined();
  });
});
