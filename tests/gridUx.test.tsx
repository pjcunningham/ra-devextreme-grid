import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import {
  ListContextProvider,
  TestMemoryRouter,
  type ListControllerResult,
  type RaRecord,
} from 'react-admin';
import { DatagridDX } from '../src/index';
import type { DatagridDXProps } from '../src/types';

type Expect<T extends true> = T;
type HasKey<T, K extends string> = K extends keyof T ? true : false;
type NotHasKey<T, K extends string> = K extends keyof T ? false : true;

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

describe('Phase 4B Managed Grid UX Test Suite', () => {
  // Group 0: TypeScript Compile-time Type Assertions (Scenario V & API Hardening)
  describe('Group 0 & Scenario V: Type Hardening', () => {
    it('Scenario V: rejects stateStoring and remoteOperations while accepting native UX props', () => {
      type Props = DatagridDXProps;

      // Compile-time assertions: rejected props must NOT exist, allowed props MUST exist
      type _TypeAssertions = [
        Expect<NotHasKey<Props, 'stateStoring'>>,
        Expect<NotHasKey<Props, 'remoteOperations'>>,
        Expect<HasKey<Props, 'columnChooser'>>,
        Expect<HasKey<Props, 'columnFixing'>>,
        Expect<HasKey<Props, 'columnHidingEnabled'>>,
        Expect<HasKey<Props, 'allowColumnResizing'>>,
        Expect<HasKey<Props, 'allowColumnReordering'>>,
      ];

      const assertionsValid: _TypeAssertions[number] = true;
      expect(assertionsValid).toBe(true);
    });
  });

  // Group 1: Column Chooser (Scenarios A–G)
  describe('Group 1: Column Chooser (Scenarios A–G)', () => {
    it('Scenario A: Column Chooser is disabled by default when omitted', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(Boolean(instance?.option('columnChooser.enabled'))).toBe(false);
    });

    it('Scenario B: enables native Column Chooser when configured', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnChooser={{ enabled: true }}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('columnChooser.enabled')).toBe(true);
    });

    it('Scenario C: preserves mode and search options on Column Chooser', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer>
            ref={gridRef}
            columnChooser={{
              enabled: true,
              mode: 'select',
              search: { enabled: true },
              title: 'Custom Chooser Title',
            }}
          >
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('columnChooser.enabled')).toBe(true);
      expect(instance?.option('columnChooser.mode')).toBe('select');
      expect(instance?.option('columnChooser.search.enabled')).toBe(true);
      expect(instance?.option('columnChooser.title')).toBe('Custom Chooser Title');
    });

    it('Scenario D: hiding a column does not call setFilters, setSort, setPage, or onSelect', () => {
      const setFilters = vi.fn();
      const setSort = vi.fn();
      const setPage = vi.fn();
      const onSelect = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        setFilters,
        setSort,
        setPage,
        onSelect,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnChooser={{ enabled: true }} selection filtering>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance).toBeDefined();

      // Clear any initialization calls
      setFilters.mockClear();
      setSort.mockClear();
      setPage.mockClear();
      onSelect.mockClear();

      // User hides the 'company' column
      act(() => {
        instance?.columnOption('company', 'visible', false);
      });

      expect(instance?.columnOption('company', 'visible')).toBe(false);
      expect(setFilters).not.toHaveBeenCalled();
      expect(setSort).not.toHaveBeenCalled();
      expect(setPage).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Scenario E: active React-Admin filter survives hiding and unhiding a column', async () => {
      const setFilters = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        filterValues: { country_q: 'UK' },
        setFilters,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnChooser={{ enabled: true }} filtering>
            <Column dataField="name" caption="Name" />
            <Column dataField="country" caption="Country" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('filterValue')).toEqual(['country', 'contains', 'UK']);

      setFilters.mockClear();

      // Hide country column
      act(() => {
        instance?.columnOption('country', 'visible', false);
      });

      // Filter in React-Admin must NOT be cleared or mutated
      expect(setFilters).not.toHaveBeenCalled();
      expect(context.filterValues).toEqual({ country_q: 'UK' });

      // Unhide country column
      act(() => {
        instance?.columnOption('country', 'visible', true);
      });

      expect(setFilters).not.toHaveBeenCalled();
      expect(instance?.option('filterValue')).toEqual(['country', 'contains', 'UK']);
    });

    it('Scenario F: active React-Admin sort survives hiding and unhiding a column', async () => {
      const setSort = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        sort: { field: 'name', order: 'ASC' },
        setSort,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnChooser={{ enabled: true }}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.columnOption('name', 'sortOrder')).toBe('asc');

      setSort.mockClear();

      // Hide name column
      act(() => {
        instance?.columnOption('name', 'visible', false);
      });

      // setSort must NOT be called
      expect(setSort).not.toHaveBeenCalled();
      expect(context.sort).toEqual({ field: 'name', order: 'ASC' });

      // Unhide name column
      act(() => {
        instance?.columnOption('name', 'visible', true);
      });

      expect(setSort).not.toHaveBeenCalled();
      expect(instance?.columnOption('name', 'sortOrder')).toBe('asc');
    });

    it('Scenario G: allowHiding={false} preserves setting on column instance', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnChooser={{ enabled: true }}>
            <Column dataField="id" caption="ID" allowHiding={false} />
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.columnOption('id', 'allowHiding')).toBe(false);
      expect(instance?.columnOption('name', 'allowHiding')).toBe(true);
    });
  });

  // Group 2: Column Resizing & Reordering (Scenarios H–L)
  describe('Group 2: Column Resizing & Reordering (Scenarios H–L)', () => {
    it('Scenario H: enables resizing and passes column resizing options', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer>
            ref={gridRef}
            allowColumnResizing={true}
            columnResizingMode="widget"
            columnMinWidth={50}
            columnAutoWidth={true}
          >
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('allowColumnResizing')).toBe(true);
      expect(instance?.option('columnResizingMode')).toBe('widget');
      expect(instance?.option('columnMinWidth')).toBe(50);
      expect(instance?.option('columnAutoWidth')).toBe(true);
    });

    it('Scenario I: column width change does not alter React-Admin query state', () => {
      const setSort = vi.fn();
      const setFilters = vi.fn();
      const setPage = vi.fn();
      const onSelect = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        setSort,
        setFilters,
        setPage,
        onSelect,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} allowColumnResizing={true}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      setSort.mockClear();
      setFilters.mockClear();
      setPage.mockClear();
      onSelect.mockClear();

      act(() => {
        instance?.columnOption('name', 'width', 250);
      });

      expect(instance?.columnOption('name', 'width')).toBe(250);
      expect(setSort).not.toHaveBeenCalled();
      expect(setFilters).not.toHaveBeenCalled();
      expect(setPage).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Scenario J: enables column reordering', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} allowColumnReordering={true}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('allowColumnReordering')).toBe(true);
    });

    it('Scenario K: column reorder (visibleIndex change) does not alter React-Admin query state', () => {
      const setSort = vi.fn();
      const setFilters = vi.fn();
      const setPage = vi.fn();
      const onSelect = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        setSort,
        setFilters,
        setPage,
        onSelect,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} allowColumnReordering={true}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      setSort.mockClear();
      setFilters.mockClear();
      setPage.mockClear();
      onSelect.mockClear();

      act(() => {
        instance?.columnOption('name', 'visibleIndex', 1);
      });

      expect(setSort).not.toHaveBeenCalled();
      expect(setFilters).not.toHaveBeenCalled();
      expect(setPage).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });

    it('Scenario L: consumer onOptionChanged receives width and visibleIndex events', () => {
      const consumerOnOptionChanged = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer>
            ref={gridRef}
            allowColumnResizing={true}
            allowColumnReordering={true}
            onOptionChanged={consumerOnOptionChanged}
          >
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      consumerOnOptionChanged.mockClear();

      act(() => {
        instance?.columnOption('name', 'width', 300);
      });

      const widthCalls = consumerOnOptionChanged.mock.calls.filter(([e]) =>
        e.fullName?.includes('width')
      );
      expect(widthCalls.length).toBeGreaterThanOrEqual(1);

      act(() => {
        instance?.columnOption('name', 'visibleIndex', 1);
      });

      const indexCalls = consumerOnOptionChanged.mock.calls.filter(([e]) =>
        e.fullName?.includes('visibleIndex')
      );
      expect(indexCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Group 3: Column Fixing (Scenarios M–P)
  describe('Group 3: Column Fixing (Scenarios M–P)', () => {
    it('Scenario M: enables column fixing on DataGrid instance', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnFixing={{ enabled: true }}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('columnFixing.enabled')).toBe(true);
    });

    it('Scenario N: per-column fixed and fixedPosition configuration reaches column instance', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnFixing={{ enabled: true }}>
            <Column dataField="id" caption="ID" fixed={true} fixedPosition="left" />
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.columnOption('id', 'fixed')).toBe(true);
      expect(instance?.columnOption('id', 'fixedPosition')).toBe('left');
      expect(instance?.columnOption('name', 'fixed')).toBeUndefined();
    });

    it('Scenario O: runtime fix/unfix changes do not call React-Admin query mutations', () => {
      const setSort = vi.fn();
      const setFilters = vi.fn();
      const setPage = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        setSort,
        setFilters,
        setPage,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnFixing={{ enabled: true }}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      setSort.mockClear();
      setFilters.mockClear();
      setPage.mockClear();

      act(() => {
        instance?.columnOption('name', 'fixed', true);
        instance?.columnOption('name', 'fixedPosition', 'right');
      });

      expect(instance?.columnOption('name', 'fixed')).toBe(true);
      expect(instance?.columnOption('name', 'fixedPosition')).toBe('right');
      expect(setSort).not.toHaveBeenCalled();
      expect(setFilters).not.toHaveBeenCalled();
      expect(setPage).not.toHaveBeenCalled();
    });

    it('Scenario P: managed selection coexists with column fixing', async () => {
      const onSelect = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        selectedIds: [1],
        onSelect,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} selection columnFixing={{ enabled: true }}>
            <Column dataField="id" caption="ID" fixed={true} fixedPosition="left" />
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('selectedRowKeys')).toEqual([1]);

      // Select another row
      await act(async () => {
        await instance?.selectRows([1, 2], false);
      });

      expect(onSelect).toHaveBeenCalledWith([1, 2]);
    });
  });

  // Group 4: Adaptive Column Hiding (Scenarios Q–U)
  describe('Group 4: Adaptive Column Hiding (Scenarios Q–U)', () => {
    it('Scenario Q: enables adaptive column hiding on DataGrid instance', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnHidingEnabled={true}>
            <Column dataField="name" caption="Name" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.option('columnHidingEnabled')).toBe(true);
    });

    it('Scenario R: column hidingPriority reaches column instance', () => {
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer> ref={gridRef} columnHidingEnabled={true}>
            <Column dataField="id" caption="ID" hidingPriority={3} />
            <Column dataField="name" caption="Name" hidingPriority={2} />
            <Column dataField="company" caption="Company" hidingPriority={1} />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance?.columnOption('id', 'hidingPriority')).toBe(3);
      expect(instance?.columnOption('name', 'hidingPriority')).toBe(2);
      expect(instance?.columnOption('company', 'hidingPriority')).toBe(1);
    });

    it('Scenario S: clicking adaptive command buttons does not trigger rowClick navigation', async () => {
      const records: Customer[] = [{ id: 1, name: 'Alice', country: 'USA', company: 'Acme' }];
      const context = createMockListContext<Customer>({
        data: records,
        total: 1,
        resource: 'customers',
      });
      let currentLocation: { pathname: string } | undefined;

      const { container } = render(
        <TestMemoryRouter
          locationCallback={(loc) => {
            currentLocation = loc;
          }}
        >
          <ListContextProvider value={context}>
            <DatagridDX<Customer> rowClick="edit" columnHidingEnabled>
              <Column dataField="name" caption="Name" />
            </DatagridDX>
          </ListContextProvider>
        </TestMemoryRouter>
      );

      expect(await screen.findByText('Alice')).toBeInTheDocument();
      const initialPath = currentLocation?.pathname;

      const dataRow = container.querySelector('.dx-data-row')!;
      expect(dataRow).toBeInTheDocument();

      // Create an adaptive expander button simulating DevExtreme's adaptive command column
      const adaptiveButton = document.createElement('div');
      adaptiveButton.className = 'dx-command-adaptive dx-datagrid-adaptive-more';
      dataRow.appendChild(adaptiveButton);

      // Clicking adaptive chevron
      fireEvent.click(adaptiveButton);
      expect(currentLocation?.pathname).toBe(initialPath);

      // Normal cell click should navigate to /customers/1
      const normalCell = dataRow.querySelector('td')!;
      fireEvent.click(normalCell);

      await waitFor(() => {
        expect(currentLocation?.pathname).toBe('/customers/1');
      });
    });

    it('Scenario T: clicking within adaptive detail row does not trigger rowClick navigation', async () => {
      const records: Customer[] = [{ id: 1, name: 'Alice', country: 'USA', company: 'Acme' }];
      const context = createMockListContext<Customer>({
        data: records,
        total: 1,
        resource: 'customers',
      });
      let currentLocation: { pathname: string } | undefined;
      const gridRef = createRef<DataGridRef<Customer, number>>();

      const { container } = render(
        <TestMemoryRouter
          locationCallback={(loc) => {
            currentLocation = loc;
          }}
        >
          <ListContextProvider value={context}>
            <DatagridDX<Customer> ref={gridRef} rowClick="edit" columnHidingEnabled>
              <Column dataField="name" caption="Name" />
            </DatagridDX>
          </ListContextProvider>
        </TestMemoryRouter>
      );

      expect(await screen.findByText('Alice')).toBeInTheDocument();
      const initialPath = currentLocation?.pathname;

      // 1. DOM element click inside adaptive detail row
      const detailRow = document.createElement('tr');
      detailRow.className = 'dx-adaptive-detail-row';
      const detailContent = document.createElement('div');
      detailContent.innerText = 'Collapsed fields';
      detailRow.appendChild(detailContent);
      container.querySelector('tbody')?.appendChild(detailRow);

      fireEvent.click(detailContent);
      expect(currentLocation?.pathname).toBe(initialPath);

      // 2. Programmatic onRowClick with rowType: 'detailAdaptive'
      const onRowClick = gridRef.current?.instance().option('onRowClick');
      expect(typeof onRowClick).toBe('function');

      act(() => {
        onRowClick?.({
          rowType: 'detailAdaptive',
          data: records[0],
          rowIndex: 1,
        } as unknown as Parameters<NonNullable<typeof onRowClick>>[0]);
      });

      expect(currentLocation?.pathname).toBe(initialPath);
    });

    it('Scenario U: consumer onAdaptiveDetailRowPreparing is invoked cleanly', () => {
      const consumerPreparing = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();
      const context = createMockListContext<Customer>({ data: sampleCustomers, total: 3 });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer>
            ref={gridRef}
            columnHidingEnabled={true}
            onAdaptiveDetailRowPreparing={consumerPreparing}
          >
            <Column dataField="name" caption="Name" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      const registeredHandler = instance?.option('onAdaptiveDetailRowPreparing');
      expect(typeof registeredHandler).toBe('function');

      const mockEvent = { component: instance } as Parameters<
        NonNullable<typeof registeredHandler>
      >[0];
      registeredHandler?.(mockEvent);
      expect(consumerPreparing).toHaveBeenCalledWith(mockEvent);
    });
  });

  // Group 5: Comprehensive Visual State Isolation (Scenario W)
  describe('Group 5: Comprehensive Visual State Isolation (Scenario W)', () => {
    it('Scenario W: composite sequence of resize, reorder, hide, and fix produces zero React-Admin query mutations', () => {
      const setPage = vi.fn();
      const setPerPage = vi.fn();
      const setSort = vi.fn();
      const setFilters = vi.fn();
      const onSelect = vi.fn();
      const gridRef = createRef<DataGridRef<Customer, number>>();

      const context = createMockListContext<Customer>({
        data: sampleCustomers,
        total: 3,
        setPage,
        setPerPage,
        setSort,
        setFilters,
        onSelect,
      });

      render(
        <ListContextProvider value={context}>
          <DatagridDX<Customer>
            ref={gridRef}
            allowColumnResizing={true}
            allowColumnReordering={true}
            columnFixing={{ enabled: true }}
            columnChooser={{ enabled: true }}
            columnHidingEnabled={true}
          >
            <Column dataField="id" caption="ID" allowHiding={false} />
            <Column dataField="name" caption="Name" />
            <Column dataField="country" caption="Country" />
            <Column dataField="company" caption="Company" />
          </DatagridDX>
        </ListContextProvider>
      );

      const instance = gridRef.current?.instance();
      expect(instance).toBeDefined();

      setPage.mockClear();
      setPerPage.mockClear();
      setSort.mockClear();
      setFilters.mockClear();
      onSelect.mockClear();

      act(() => {
        // 1. Resize
        instance?.columnOption('name', 'width', 220);
        // 2. Reorder
        instance?.columnOption('name', 'visibleIndex', 3);
        // 3. Hide
        instance?.columnOption('company', 'visible', false);
        // 4. Fix
        instance?.columnOption('id', 'fixed', true);
        instance?.columnOption('id', 'fixedPosition', 'left');
      });

      expect(setPage).not.toHaveBeenCalled();
      expect(setPerPage).not.toHaveBeenCalled();
      expect(setSort).not.toHaveBeenCalled();
      expect(setFilters).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    });
  });
});
