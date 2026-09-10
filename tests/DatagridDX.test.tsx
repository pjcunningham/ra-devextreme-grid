import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import {
  AdminContext,
  ListBase,
  ListContextProvider,
  TestMemoryRouter,
  useListContext,
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

interface RouterLocation {
  pathname: string;
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

describe('DatagridDX component (Phase 3 Selection & Navigation)', () => {
  // Scenario A: Selection disabled by default
  it('Scenario A: selection is disabled by default (mode: "none", no checkboxes)', () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ];
    const contextValue = createMockListContext<Customer>({ data: records, total: 2 });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('selection.mode')).toBe('none');
    expect(document.querySelector('.dx-select-checkbox')).toBeNull();
  });

  // Scenario B: Selection enabled
  it('Scenario B: selection enabled configures mode: "multiple" and selectAllMode: "page"', () => {
    const records: Customer[] = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
    const contextValue = createMockListContext<Customer>({ data: records, total: 1 });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('selection.mode')).toBe('multiple');
    expect(instance?.option('selection.selectAllMode')).toBe('page');
    expect(instance?.option('selection.deferred')).toBe(false);
  });

  // Scenario C: React-Admin -> DevExtreme projection
  it('Scenario C: maps React-Admin selectedIds to DevExtreme selectedRowKeys', () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Carol', email: 'carol@example.com' },
    ];
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 3,
      selectedIds: [2],
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('selectedRowKeys')).toEqual([2]);
  });

  // Scenario D: Off-page IDs filtered from DevExtreme
  it('Scenario D: excludes off-page selected IDs from DevExtreme selectedRowKeys', () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Carol', email: 'carol@example.com' },
    ];
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 30,
      selectedIds: [2, 15],
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('selectedRowKeys')).toEqual([2]);
  });

  // Scenario E: DevExtreme -> React-Admin selection
  it('Scenario E: merges current page user selection with off-page selected IDs via onSelect', async () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Carol', email: 'carol@example.com' },
    ];
    const onSelect = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 30,
      selectedIds: [15],
      onSelect,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    await act(async () => {
      await instance?.selectRows([2], true);
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    const callArgs = onSelect.mock.calls[0]?.[0] as (string | number)[] | undefined;
    expect(new Set(callArgs ?? [])).toEqual(new Set([15, 2]));
  });

  // Scenario F: Current-page deselection preserves off-page IDs
  it('Scenario F: deselecting visible rows preserves off-page selections in onSelect', async () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Carol', email: 'carol@example.com' },
    ];
    const onSelect = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 30,
      selectedIds: [2, 15],
      onSelect,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    await act(async () => {
      await instance?.deselectRows([2]);
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    expect(onSelect).toHaveBeenCalledWith([15]);
  });

  // Scenario G: External selection clearing
  it('Scenario G: external selection clearing updates DevExtreme without calling onSelect', () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ];
    const onSelect = vi.fn();
    const initialContext = createMockListContext<Customer>({
      data: records,
      total: 2,
      selectedIds: [2],
      onSelect,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { rerender } = render(
      <ListContextProvider value={initialContext}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('selectedRowKeys')).toEqual([2]);
    expect(onSelect).not.toHaveBeenCalled();

    const clearedContext = createMockListContext<Customer>({
      data: records,
      total: 2,
      selectedIds: [],
      onSelect,
    });

    rerender(
      <ListContextProvider value={clearedContext}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(instance?.option('selectedRowKeys')).toEqual([]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Scenario H & I: Feedback-loop guard prevents redundant onSelect and ignores array ordering
  it('Scenario H & I: feedback-loop guard prevents redundant onSelect and ignores array ordering', () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
      { id: 3, name: 'Carol', email: 'carol@example.com' },
    ];
    const onSelect = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 3,
      selectedIds: [2, 3],
      onSelect,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(onSelect).not.toHaveBeenCalled();

    // Trigger DevExtreme selection with reversed order [3, 2]
    act(() => {
      instance?.selectRows([3, 2], false);
    });

    // Logical set is unchanged -> onSelect must NOT be invoked
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Scenario J: String identifiers
  it('Scenario J: preserves string identifiers strictly without numeric coercion', async () => {
    const records: StringIdRecord[] = [
      { id: 'cust-1', title: 'First' },
      { id: '1', title: 'Second' },
    ];
    const onSelect = vi.fn();
    const contextValue = createMockListContext<StringIdRecord>({
      data: records,
      total: 2,
      selectedIds: ['1'],
      onSelect,
    });
    const gridRef = createRef<DataGridRef<StringIdRecord, string>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<StringIdRecord> ref={gridRef} selection>
          <Column dataField="id" caption="ID" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('selectedRowKeys')).toEqual(['1']);

    await act(async () => {
      await instance?.selectRows(['cust-1'], true);
    });

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    const callArgs = onSelect.mock.calls[0]?.[0] as (string | number)[] | undefined;
    expect(new Set(callArgs ?? [])).toEqual(new Set(['1', 'cust-1']));
  });

  // Scenario K: Select all on current page
  it('Scenario K: select all on current page preserves off-page selected IDs', async () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ];
    const onSelect = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 20,
      selectedIds: [99],
      onSelect,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { container } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();

    const headerCheckbox = container.querySelector('.dx-header-row .dx-select-checkbox')!;
    expect(headerCheckbox).toBeInTheDocument();
    fireEvent.click(headerCheckbox);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledTimes(1);
    });
    const callArgsK = onSelect.mock.calls[0]?.[0] as (string | number)[] | undefined;
    expect(new Set(callArgsK ?? [])).toEqual(new Set([99, 1, 2]));
  });

  // Scenario L: Cross-page selection across page navigation
  it('Scenario L: preserves selections across real page navigation', async () => {
    const allRecords: Customer[] = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `Customer ${i + 1}`,
      email: `c${i + 1}@example.com`,
    }));

    const getListSpy = vi.fn().mockImplementation(async (_resource, params) => {
      const { page = 1, perPage = 5 } = params.pagination ?? {};
      const start = (page - 1) * perPage;
      return {
        data: allRecords.slice(start, start + perPage),
        total: allRecords.length,
      };
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

    const gridRef = createRef<DataGridRef<Customer, number>>();
    let testListContext: ListControllerResult<Customer> | undefined;

    const ContextProbe = () => {
      testListContext = useListContext<Customer>();
      return null;
    };

    const { unmount } = render(
      <AdminContext dataProvider={dataProvider}>
        <ListBase resource="customers" perPage={5}>
          <ContextProbe />
          <DatagridDX<Customer> ref={gridRef} selection>
            <Column dataField="id" caption="ID" />
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListBase>
      </AdminContext>
    );

    expect(await screen.findByText('Customer 1')).toBeInTheDocument();

    // Select row 2 on page 1
    await act(async () => {
      await gridRef.current?.instance().selectRows([2], true);
    });

    await waitFor(() => {
      expect(testListContext?.selectedIds).toEqual([2]);
    });

    // Move to page 2 via React-Admin's setPage
    act(() => {
      testListContext?.setPage(2);
    });
    expect(await screen.findByText('Customer 6')).toBeInTheDocument();

    // Verify page 2 initially shows no selected rows in DevExtreme (since 2 is off-page)
    expect(gridRef.current?.instance().option('selectedRowKeys')).toEqual([]);

    // Select row 7 on page 2
    await act(async () => {
      await gridRef.current?.instance().selectRows([7], true);
    });

    await waitFor(() => {
      expect(new Set(testListContext?.selectedIds)).toEqual(new Set([2, 7]));
    });

    // Return to page 1 via React-Admin's setPage
    act(() => {
      testListContext?.setPage(1);
    });
    expect(await screen.findByText('Customer 1')).toBeInTheDocument();

    // Verify row 2 is visibly selected on page 1 again
    await waitFor(() => {
      expect(gridRef.current?.instance().option('selectedRowKeys')).toEqual([2]);
    });
    expect(new Set(testListContext?.selectedIds)).toEqual(new Set([2, 7]));

    unmount();
  });

  // Scenario M: Selection preservation across server sorting
  it('Scenario M: retains selection in React-Admin when server sort moves record off current page', () => {
    const page1Records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ];
    const onSelect = vi.fn();
    const initialContext = createMockListContext<Customer>({
      data: page1Records,
      total: 10,
      selectedIds: [2],
      onSelect,
      sort: { field: 'id', order: 'ASC' },
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    const { rerender } = render(
      <ListContextProvider value={initialContext}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(gridRef.current?.instance().option('selectedRowKeys')).toEqual([2]);

    // Sort order changes on server, now returning records 9 and 10 (record 2 moved off-page)
    const pageAfterSort: Customer[] = [
      { id: 9, name: 'Yvonne', email: 'yvonne@example.com' },
      { id: 10, name: 'Zack', email: 'zack@example.com' },
    ];
    const sortedContext = createMockListContext<Customer>({
      data: pageAfterSort,
      total: 10,
      selectedIds: [2],
      onSelect,
      sort: { field: 'name', order: 'DESC' },
    });

    rerender(
      <ListContextProvider value={sortedContext}>
        <DatagridDX<Customer> ref={gridRef} selection>
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    // DevExtreme receives empty selectedRowKeys since record 2 is off-page
    expect(gridRef.current?.instance().option('selectedRowKeys')).toEqual([]);
    // onSelect must NOT be called (selection is not cleared in React-Admin)
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Scenario N: Native onSelectionChanged composition
  it('Scenario N: invokes consumer onSelectionChanged callback with native event', async () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice', email: 'alice@example.com' },
      { id: 2, name: 'Bob', email: 'bob@example.com' },
    ];
    const consumerOnSelectionChanged = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 2,
      selectedIds: [],
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer>
          ref={gridRef}
          selection
          onSelectionChanged={consumerOnSelectionChanged}
        >
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    await act(async () => {
      await instance?.selectRows([1], false);
    });

    expect(consumerOnSelectionChanged).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedRowKeys: [1],
      })
    );
  });

  // Navigation Scenarios O through W
  // Scenario O: rowClick="edit"
  it('Scenario O: rowClick="edit" redirects to edit route on data row click', async () => {
    const records: Customer[] = [{ id: 42, name: 'Douglas', email: 'douglas@example.com' }];
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> rowClick="edit">
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Douglas')).toBeInTheDocument();
    const row = container.querySelector('.dx-data-row')!;
    fireEvent.click(row);

    await waitFor(() => {
      expect(currentLocation?.pathname).toBe('/customers/42');
    });
  });

  // Scenario P: rowClick="show"
  it('Scenario P: rowClick="show" redirects to show route on data row click', async () => {
    const records: Customer[] = [{ id: 42, name: 'Douglas', email: 'douglas@example.com' }];
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> rowClick="show">
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Douglas')).toBeInTheDocument();
    const row = container.querySelector('.dx-data-row')!;
    fireEvent.click(row);

    await waitFor(() => {
      expect(currentLocation?.pathname).toBe('/customers/42/show');
    });
  });

  // Scenario Q: rowClick={false}
  it('Scenario Q: rowClick={false} produces no redirection on data row click', async () => {
    const records: Customer[] = [{ id: 42, name: 'Douglas', email: 'douglas@example.com' }];
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> rowClick={false}>
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Douglas')).toBeInTheDocument();
    const initialPath = currentLocation?.pathname;
    const row = container.querySelector('.dx-data-row')!;
    fireEvent.click(row);

    expect(currentLocation?.pathname).toBe(initialPath);
  });

  // Scenario R: Default rowClick omitted
  it('Scenario R: omitted rowClick produces no redirection on data row click', async () => {
    const records: Customer[] = [{ id: 42, name: 'Douglas', email: 'douglas@example.com' }];
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer>>
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Douglas')).toBeInTheDocument();
    const initialPath = currentLocation?.pathname;
    const row = container.querySelector('.dx-data-row')!;
    fireEvent.click(row);

    expect(currentLocation?.pathname).toBe(initialPath);
  });

  // Scenario S: String ID navigation
  it('Scenario S: navigation preserves string record identifiers without alteration', async () => {
    const records: StringIdRecord[] = [{ id: 'client-special/uuid-99', title: 'Special Item' }];
    const contextValue = createMockListContext<StringIdRecord>({
      data: records,
      total: 1,
      resource: 'items',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<StringIdRecord> rowClick="edit">
            <Column dataField="title" caption="Title" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Special Item')).toBeInTheDocument();
    const row = container.querySelector('.dx-data-row')!;
    fireEvent.click(row);

    await waitFor(() => {
      expect(currentLocation?.pathname).toBe('/items/client-special%2Fuuid-99');
    });
  });

  // Scenario T: Only data rows navigate
  it('Scenario T: non-data row clicks do not trigger navigation', async () => {
    const records: Customer[] = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> rowClick="edit">
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    const initialPath = currentLocation?.pathname;

    const headerRow = container.querySelector('.dx-header-row')!;
    fireEvent.click(headerRow);

    expect(currentLocation?.pathname).toBe(initialPath);
  });

  // Scenario U: Selection checkbox click does not navigate
  it('Scenario U: clicking selection checkbox toggles selection without navigating', async () => {
    const records: Customer[] = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
    const onSelect = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      selectedIds: [],
      onSelect,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> selection rowClick="edit">
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    const initialPath = currentLocation?.pathname;

    const checkbox = container.querySelector('.dx-data-row .dx-select-checkbox')!;
    expect(checkbox).toBeInTheDocument();
    fireEvent.click(checkbox);

    // Selection was triggered
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith([1]);
    });
    // Navigation did NOT occur
    expect(currentLocation?.pathname).toBe(initialPath);
  });

  // Scenario V: Native onRowClick composition
  it('Scenario V: invokes consumer onRowClick handler alongside navigation', async () => {
    const records: Customer[] = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
    const consumerOnRowClick = vi.fn();
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> rowClick="edit" onRowClick={consumerOnRowClick}>
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    const row = container.querySelector('.dx-data-row')!;
    fireEvent.click(row);

    expect(consumerOnRowClick).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(currentLocation?.pathname).toBe('/customers/1');
    });
  });

  // Scenario W: Consumer cancellation via e.handled = true
  it('Scenario W: consumer setting e.handled = true aborts navigation', async () => {
    const records: Customer[] = [{ id: 1, name: 'Alice', email: 'alice@example.com' }];
    const consumerOnRowClick = vi.fn((e) => {
      e.handled = true;
    });
    const contextValue = createMockListContext<Customer>({
      data: records,
      total: 1,
      resource: 'customers',
    });
    let currentLocation: RouterLocation | undefined;

    const { container } = render(
      <TestMemoryRouter
        locationCallback={(loc) => {
          currentLocation = loc;
        }}
      >
        <ListContextProvider value={contextValue}>
          <DatagridDX<Customer> rowClick="edit" onRowClick={consumerOnRowClick}>
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    expect(await screen.findByText('Alice')).toBeInTheDocument();
    const initialPath = currentLocation?.pathname;
    const row = container.querySelector('.dx-data-row')!;
    fireEvent.click(row);

    expect(consumerOnRowClick).toHaveBeenCalledTimes(1);
    expect(currentLocation?.pathname).toBe(initialPath);
  });
});
