import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
import { DatagridDX, type DatagridDXProps } from '../src/index';

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

  it('Scenario J: enforces data-shaping safeguards (paging.enabled = false, sorting.mode = "none")', () => {
    const contextValue = createMockListContext<Customer>({
      data: [{ id: 1, name: 'Safeguard Test', email: 'safe@example.com' }],
      total: 1,
    });
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX<Customer>
          ref={gridRef}
          // Attempt user override to verify adapter precedence
          paging={{ enabled: true } as unknown as DatagridDXProps['paging']}
          sorting={{ mode: 'single' } as unknown as DatagridDXProps['sorting']}
        >
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('paging.enabled')).toBe(false);
    expect(instance?.option('sorting.mode')).toBe('none');
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
