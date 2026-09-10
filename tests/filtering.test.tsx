import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { createRef } from 'react';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import {
  ListContextProvider,
  TestMemoryRouter,
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
    resource: 'customers',
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
  country: string;
  company: string;
}

const sampleCustomers: Customer[] = [
  { id: 1, name: 'Alice Smith', country: 'USA', company: 'Acme Corp' },
  { id: 2, name: 'Bob Jones', country: 'UK', company: 'Globex Ltd' },
  { id: 3, name: 'Carol Danvers', country: 'USA', company: 'Stark Industries' },
];

describe('DatagridDX Managed Filtering (Phase 4A)', () => {
  // Scenario M: Disabled by default
  it('Scenario M: filtering is disabled by default when filtering prop is omitted or false', async () => {
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef}>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance?.option('filterRow.visible')).toBe(false);
  });

  // Scenario N: Enable Filter Row with defaults or custom options
  it('Scenario N: enables Filter Row with defaults or custom presentation options', async () => {
    const gridRef1 = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

    const { rerender } = render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef1} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    let instance = gridRef1.current?.instance();
    expect(instance?.option('filterRow.visible')).toBe(true);
    expect(instance?.option('filterRow.showOperationChooser')).toBe(true);
    expect(instance?.option('filterRow.applyFilter')).toBe('auto');

    // With custom options
    const gridRef2 = createRef<DataGridRef<Customer, number>>();
    rerender(
      <ListContextProvider value={context}>
        <DatagridDX<Customer>
          ref={gridRef2}
          filtering={{ applyFilter: 'onClick', showOperationChooser: false }}
        >
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    instance = gridRef2.current?.instance();
    expect(instance?.option('filterRow.visible')).toBe(true);
    expect(instance?.option('filterRow.applyFilter')).toBe('onClick');
    expect(instance?.option('filterRow.showOperationChooser')).toBe(false);
  });

  // Scenario O & P: Filter Row -> setFilters with debounce flag
  it('Scenario O & P: translates Filter Row input to setFilters with debounce flag set to true', async () => {
    const setFilters = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const displayedFilters = { name_q: true };
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      setFilters,
      displayedFilters,
    });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    act(() => {
      gridRef.current?.instance().option('filterValue', ['name', 'contains', 'smith']);
    });

    expect(setFilters).toHaveBeenCalledTimes(1);
    expect(setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ name_q: 'smith' }),
      displayedFilters,
      true
    );
  });

  // Scenario Q: External React-Admin filterValues -> DevExtreme Filter Row
  it('Scenario Q: updates DevExtreme Filter Row when React-Admin filterValues changes externally', async () => {
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const initialContext = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      filterValues: { country_eq: 'UK' },
    });

    const { rerender } = render(
      <ListContextProvider value={initialContext}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(gridRef.current?.instance().option('filterValue')).toEqual(['country', '=', 'UK']);

    // External change in React-Admin
    const updatedContext = createMockListContext<Customer>({
      data: sampleCustomers.slice(0, 1),
      total: 1,
      filterValues: { name_q: 'Alice' },
    });

    rerender(
      <ListContextProvider value={updatedContext}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(gridRef.current?.instance().option('filterValue')).toEqual([
      'name',
      'contains',
      'Alice',
    ]);
  });

  // Scenario R: Feedback loop protection
  it('Scenario R: programmatic synchronization from React-Admin does not redundantly invoke setFilters', async () => {
    const setFilters = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      filterValues: { country_eq: 'UK' },
      setFilters,
    });

    const { rerender } = render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    // Initial mount shouldn't redundantly call setFilters
    expect(setFilters).not.toHaveBeenCalled();

    // Rerender with another external filter
    const updatedContext = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      filterValues: { country_eq: 'USA' },
      setFilters,
    });

    rerender(
      <ListContextProvider value={updatedContext}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    expect(setFilters).not.toHaveBeenCalled();
    expect(gridRef.current?.instance().option('filterValue')).toEqual(['country', '=', 'USA']);
  });

  // Scenario S: Clearing filter removes only corresponding managed key
  it('Scenario S: clearing a Filter Row filter removes only the managed column key', async () => {
    const setFilters = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      filterValues: { name_q: 'smith' },
      setFilters,
    });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    act(() => {
      gridRef.current?.instance().option('filterValue', null);
    });

    expect(setFilters).toHaveBeenCalledWith({}, expect.anything(), true);
  });

  // Scenario T: Preserve unrelated React-Admin filters
  it('Scenario T: preserves unrelated React-Admin filters when modifying or clearing grid filters', async () => {
    const setFilters = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      filterValues: {
        q: 'global search query',
        backend_flag: 42,
        country_eq: 'UK',
      },
      setFilters,
    });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    // User updates country filter in grid
    act(() => {
      gridRef.current?.instance().option('filterValue', ['country', '=', 'France']);
    });

    expect(setFilters).toHaveBeenCalledWith(
      {
        q: 'global search query',
        backend_flag: 42,
        country_eq: 'France',
      },
      expect.anything(),
      true
    );

    // User clears country filter
    setFilters.mockClear();
    act(() => {
      gridRef.current?.instance().option('filterValue', null);
    });

    expect(setFilters).toHaveBeenCalledWith(
      {
        q: 'global search query',
        backend_flag: 42,
      },
      expect.anything(),
      true
    );
  });

  // Scenario U: Multiple grid filters produce merged React-Admin filter object
  it('Scenario U: combines multiple column filters into a merged React-Admin query object', async () => {
    const setFilters = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      filterValues: { global_q: 'test' },
      setFilters,
    });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    act(() => {
      gridRef.current
        ?.instance()
        .option('filterValue', [['name', 'contains', 'smith'], 'and', ['country', '=', 'USA']]);
    });

    expect(setFilters).toHaveBeenCalledWith(
      {
        global_q: 'test',
        name_q: 'smith',
        country_eq: 'USA',
      },
      expect.anything(),
      true
    );
  });

  // Scenario V: Consumer onOptionChanged executes exactly once per event
  it('Scenario V: invokes consumer onOptionChanged handler exactly once per event', async () => {
    const consumerOptionChanged = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering onOptionChanged={consumerOptionChanged}>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    consumerOptionChanged.mockClear();

    // Trigger filterValue option change
    act(() => {
      gridRef.current?.instance().option('filterValue', ['name', 'contains', 'alice']);
    });

    const filterCalls = consumerOptionChanged.mock.calls.filter(
      (call) => call[0]?.name === 'filterValue'
    );
    expect(filterCalls).toHaveLength(1);
    expect(filterCalls[0]?.[0]).toHaveProperty('name', 'filterValue');

    // Trigger sorting option change
    consumerOptionChanged.mockClear();
    act(() => {
      gridRef.current?.instance().columnOption(0, 'sortOrder', 'asc');
    });

    const sortCalls = consumerOptionChanged.mock.calls.filter(
      (call) => call[0]?.name === 'columns' && call[0]?.fullName?.endsWith('.sortOrder')
    );
    expect(sortCalls).toHaveLength(1);
  });

  // Scenario W: Sorting coexistence
  it('Scenario W: sorting does not reset active filters and filtering does not reset active sort', async () => {
    const setSort = vi.fn();
    const setFilters = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      sort: { field: 'name', order: 'ASC' },
      filterValues: { country_eq: 'UK' },
      setSort,
      setFilters,
    });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    // Grid initialized with both sort and filter
    expect(gridRef.current?.instance().columnOption(0, 'sortOrder')).toBe('asc');
    expect(gridRef.current?.instance().option('filterValue')).toEqual(['country', '=', 'UK']);

    // User sorts by country
    act(() => {
      gridRef.current?.instance().columnOption(1, 'sortOrder', 'desc');
    });

    expect(setSort).toHaveBeenCalledWith({ field: 'country', order: 'DESC' });
    // Filter remains intact
    expect(gridRef.current?.instance().option('filterValue')).toEqual(['country', '=', 'UK']);

    // User updates filter
    act(() => {
      gridRef.current?.instance().option('filterValue', ['name', 'contains', 'smith']);
    });

    expect(setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ name_q: 'smith' }),
      expect.anything(),
      true
    );
    // Sort remains intact
    expect(gridRef.current?.instance().columnOption(0, 'sortOrder')).toBe('asc');
  });

  // Scenario X: Selection coexistence
  it('Scenario X: filtering does not clear off-page selected IDs from React-Admin store', async () => {
    const onSelect = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();

    // Selected IDs include record 1 (on page) and record 99 (off page)
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      selectedIds: [1, 99],
      onSelect,
    });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} selection filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    // DevExtreme receives only current page selected keys ([1])
    expect(gridRef.current?.instance().option('selectedRowKeys')).toEqual([1]);

    // Select row 2 on current page
    await act(async () => {
      await gridRef.current?.instance().selectRows([2], true);
    });

    // onSelect merges off-page id 99 with newly selected ids [1, 2]
    expect(onSelect).toHaveBeenCalledWith(expect.arrayContaining([99, 1, 2]));
  });

  // Scenario Y: Navigation isolation
  it('Scenario Y: interacting with or clicking inside Filter Row does not trigger rowClick navigation', async () => {
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

    render(
      <TestMemoryRouter initialEntries={['/customers']}>
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} rowClick="edit" filtering>
            <Column dataField="name" caption="Name" />
            <Column dataField="country" caption="Country" />
          </DatagridDX>
        </ListContextProvider>
      </TestMemoryRouter>
    );

    // Simulate click on filter row
    const onRowClick = gridRef.current?.instance().option('onRowClick');
    expect(typeof onRowClick).toBe('function');

    act(() => {
      onRowClick?.({
        rowType: 'filter',
        data: undefined,
        rowIndex: -1,
      } as unknown as Parameters<NonNullable<typeof onRowClick>>[0]);
    });

    // Screen should still be on /customers without navigating
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
  });

  // Scenario Z: Phase 4B remoteOperations cleanup
  it('Scenario Z: operates cleanly without remoteOperations.filtering passed to DataGrid', async () => {
    const setFilters = vi.fn();
    const gridRef = createRef<DataGridRef<Customer, number>>();
    const context = createMockListContext<Customer>({
      data: sampleCustomers,
      total: 3,
      setFilters,
    });

    render(
      <ListContextProvider value={context}>
        <DatagridDX<Customer> ref={gridRef} filtering>
          <Column dataField="name" caption="Name" />
          <Column dataField="country" caption="Country" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    // remoteOperations.filtering is not configured (reverts to DevExtreme default 'auto')
    expect(instance?.option('remoteOperations.filtering')).toBeUndefined();
    expect(instance?.option('remoteOperations')).not.toEqual(
      expect.objectContaining({ filtering: true })
    );

    // Verify filter operation still triggers setFilters
    act(() => {
      instance?.option('filterValue', ['country', '=', 'UK']);
    });

    expect(setFilters).toHaveBeenCalledWith(
      expect.objectContaining({ country_eq: 'UK' }),
      expect.anything(),
      true
    );
  });
});
