import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { ListContextProvider, type ListControllerResult, type RaRecord } from 'react-admin';
import type { PaginationRef } from 'devextreme-react/pagination';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import { DatagridDX, DatagridDXPagination } from '../src/index';

function createMockListContext<RecordType extends RaRecord = RaRecord>(
  overrides?: Partial<ListControllerResult<RecordType>>
): ListControllerResult<RecordType> {
  const base = {
    data: [] as RecordType[],
    total: 50,
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
    hasNextPage: true,
    hasPreviousPage: false,
    ...overrides,
  };
  return base as unknown as ListControllerResult<RecordType>;
}

describe('DatagridDXPagination component', () => {
  it('Scenario A: maps ListContext state (page, perPage, total) to DevExtreme Pagination instance options', () => {
    const contextValue = createMockListContext({
      page: 3,
      perPage: 25,
      total: 100,
    });
    const ref = createRef<PaginationRef>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDXPagination ref={ref} />
      </ListContextProvider>
    );

    const instance = ref.current?.instance();
    expect(instance).toBeDefined();
    expect(instance?.option('pageIndex')).toBe(3);
    expect(instance?.option('pageSize')).toBe(25);
    expect(instance?.option('itemCount')).toBe(100);
  });

  it('Scenario B: invokes setPage(newPage) exactly once when a page change is triggered', () => {
    const setPage = vi.fn();
    const contextValue = createMockListContext({
      page: 1,
      perPage: 10,
      total: 50,
      setPage,
    });
    const ref = createRef<PaginationRef>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDXPagination ref={ref} />
      </ListContextProvider>
    );

    const instance = ref.current?.instance();
    expect(instance).toBeDefined();

    // DevExtreme dxPagination option changes trigger onPageIndexChange
    instance?.option('pageIndex', 2);

    expect(setPage).toHaveBeenCalledTimes(1);
    expect(setPage).toHaveBeenCalledWith(2);
  });

  it('Scenario C: invokes setPerPage(newSize) exactly once and does not redundantly call setPage(1)', () => {
    const setPage = vi.fn();
    const setPerPage = vi.fn();
    const contextValue = createMockListContext({
      page: 2,
      perPage: 10,
      total: 50,
      setPage,
      setPerPage,
    });
    const ref = createRef<PaginationRef>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDXPagination ref={ref} />
      </ListContextProvider>
    );

    const instance = ref.current?.instance();
    expect(instance).toBeDefined();

    instance?.option('pageSize', 25);

    expect(setPerPage).toHaveBeenCalledTimes(1);
    expect(setPerPage).toHaveBeenCalledWith(25);
    expect(setPage).not.toHaveBeenCalled();
  });

  it('Scenario D: passes through presentation props such as showInfo, showNavigationButtons, showPageSizeSelector, and allowedPageSizes', () => {
    const contextValue = createMockListContext({
      page: 1,
      perPage: 10,
      total: 50,
    });
    const ref = createRef<PaginationRef>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDXPagination
          ref={ref}
          showInfo={false}
          showNavigationButtons={false}
          showPageSizeSelector={false}
          allowedPageSizes={[10, 20, 30]}
        />
      </ListContextProvider>
    );

    const instance = ref.current?.instance();
    expect(instance).toBeDefined();
    expect(instance?.option('showInfo')).toBe(false);
    expect(instance?.option('showNavigationButtons')).toBe(false);
    expect(instance?.option('showPageSizeSelector')).toBe(false);
    expect(instance?.option('allowedPageSizes')).toEqual([10, 20, 30]);
  });

  it('Scenario E: adapter-owned options take precedence over consumer props', () => {
    const contextValue = createMockListContext({
      page: 2,
      perPage: 15,
      total: 75,
    });
    const ref = createRef<PaginationRef>();

    // Pass conflicting props via type assertion to test runtime precedence
    const conflictingProps = {
      pageIndex: 99,
      pageSize: 999,
      itemCount: 9999,
    } as unknown as Record<string, unknown>;

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDXPagination ref={ref} {...conflictingProps} />
      </ListContextProvider>
    );

    const instance = ref.current?.instance();
    expect(instance).toBeDefined();
    expect(instance?.option('pageIndex')).toBe(2);
    expect(instance?.option('pageSize')).toBe(15);
    expect(instance?.option('itemCount')).toBe(75);
  });

  it('Scenario F: returns null when total is undefined or null', () => {
    const contextUndefined = createMockListContext({
      page: 1,
      perPage: 10,
      total: undefined,
    });
    const { container: containerUndefined } = render(
      <ListContextProvider value={contextUndefined}>
        <DatagridDXPagination />
      </ListContextProvider>
    );
    expect(containerUndefined.firstChild).toBeNull();

    const contextNull = createMockListContext({
      page: 1,
      perPage: 10,
      total: null as unknown as number,
    });
    const { container: containerNull } = render(
      <ListContextProvider value={contextNull}>
        <DatagridDXPagination />
      </ListContextProvider>
    );
    expect(containerNull.firstChild).toBeNull();
  });

  it('Scenario G: DataGrid retains paging.enabled = false and paging is unexposed in public props', () => {
    const contextValue = createMockListContext({
      data: [{ id: 1, name: 'Alice' }],
      total: 1,
    });
    const gridRef = createRef<DataGridRef>();

    render(
      <ListContextProvider value={contextValue}>
        <DatagridDX ref={gridRef}>
          <Column dataField="id" caption="ID" />
          <Column dataField="name" caption="Name" />
        </DatagridDX>
      </ListContextProvider>
    );

    const instance = gridRef.current?.instance();
    expect(instance).toBeDefined();
    expect(instance?.option('paging.enabled')).toBe(false);
  });

  it('applies default theme background and text color styles and supports custom style override', () => {
    const contextValue = createMockListContext({
      page: 1,
      perPage: 10,
      total: 50,
    });

    const { container: defaultContainer } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDXPagination />
      </ListContextProvider>
    );

    const defaultElement = defaultContainer.querySelector('.dx-pagination') as HTMLElement;
    expect(defaultElement).not.toBeNull();
    expect(defaultElement.style.backgroundColor).toBe('var(--dx-component-color-bg, #fff)');
    expect(defaultElement.style.color).toBe('var(--dx-color-text, #333)');
    expect(defaultElement.style.paddingLeft).toBe('10px');
    expect(defaultElement.style.paddingRight).toBe('10px');

    const { container: customContainer } = render(
      <ListContextProvider value={contextValue}>
        <DatagridDXPagination
          style={{ backgroundColor: 'rgb(240, 240, 240)', paddingLeft: '20px' }}
        />
      </ListContextProvider>
    );

    const customElement = customContainer.querySelector('.dx-pagination') as HTMLElement;
    expect(customElement).not.toBeNull();
    expect(customElement.style.backgroundColor).toBe('rgb(240, 240, 240)');
    expect(customElement.style.paddingLeft).toBe('20px');
  });
});
