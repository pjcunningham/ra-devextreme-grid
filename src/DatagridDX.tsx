import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ForwardedRef,
  type ReactElement,
} from 'react';
import { DataGrid, type DataGridRef, type IDataGridOptions } from 'devextreme-react/data-grid';
import {
  useInRouterContext,
  useListContext,
  useRedirect,
  type RaRecord,
  type SortPayload,
} from 'react-admin';
import type { DatagridDXProps } from './types';
import { toDxSortOrder, toRaSortOrder } from './sortUtils';
import { areIdentifierSetsEqual } from './selectionUtils';
import { useManagedFiltering } from './useManagedFiltering';
import { useGridLayoutPersistence } from './persistence/useGridLayoutPersistence';

const DEFAULT_EMPTY_ARRAY: never[] = [];
const stateStoring = { enabled: false };

function NavigationBridge({
  redirectRef,
}: {
  redirectRef: { current: ReturnType<typeof useRedirect> | null };
}) {
  const redirect = useRedirect();
  redirectRef.current = redirect;
  return null;
}

type DataGridContentReadyEvent<RecordType extends RaRecord = RaRecord> = Parameters<
  NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onContentReady']>
>[0];

type DataGridOptionChangedEvent<RecordType extends RaRecord = RaRecord> = Parameters<
  NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onOptionChanged']>
>[0];

type DataGridSelectionChangedEvent<RecordType extends RaRecord = RaRecord> = Parameters<
  NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onSelectionChanged']>
>[0];

type DataGridRowClickEvent<RecordType extends RaRecord = RaRecord> = Parameters<
  NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onRowClick']>
>[0];

/**
 * Managed DatagridDX component bridging React-Admin and DevExtreme DataGrid.
 *
 * Consumes records, loading state, and single-column sorting from React-Admin's ListContext.
 * Row keys are locked to canonical `record.id`. DevExtreme client-side
 * paging remains disabled, and sorting is configured to `mode: 'single'`.
 */
export const DatagridDX = forwardRef(function DatagridDX<RecordType extends RaRecord = RaRecord>(
  props: DatagridDXProps<RecordType>,
  ref: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>
) {
  const { data, isPending, isFetching, sort, setSort, selectedIds, onSelect, resource } =
    useListContext<RecordType>();
  const isInRouter = useInRouterContext();
  const redirectRef = useRef<ReturnType<typeof useRedirect> | null>(null);
  const innerRef = useRef<DataGridRef<RecordType, RecordType['id']> | null>(null);

  // Guards to isolate programmatic sort synchronization from user interactions
  const isSyncingRef = useRef(false);
  const lastSyncedSortRef = useRef<SortPayload | null>(null);

  useImperativeHandle(ref, () => innerRef.current as DataGridRef<RecordType, RecordType['id']>);

  // Synchronize loading overlay with React-Admin fetch lifecycle
  useEffect(() => {
    const grid = innerRef.current?.instance();
    if (!grid) return;

    if (isPending || isFetching) {
      grid.beginCustomLoading('');
    } else {
      grid.endCustomLoading();
    }
  }, [isPending, isFetching]);

  // Synchronize React-Admin sort state to DevExtreme column sortOrder
  const syncGridSort = useCallback(() => {
    const grid = innerRef.current?.instance();
    if (!grid || typeof grid.columnCount !== 'function') return;

    const count = grid.columnCount();
    if (count === 0) return;

    let needsUpdate = false;
    for (let i = 0; i < count; i++) {
      const col = grid.columnOption(i);
      if (!col) continue;
      const isTarget = Boolean(sort && (col.dataField === sort.field || col.name === sort.field));
      const targetOrder = isTarget && sort ? toDxSortOrder(sort.order) : undefined;
      if (col.sortOrder !== targetOrder) {
        needsUpdate = true;
        break;
      }
    }

    if (!needsUpdate) {
      if (sort) {
        lastSyncedSortRef.current = { field: sort.field, order: sort.order };
      }
      return;
    }

    isSyncingRef.current = true;
    try {
      for (let i = 0; i < count; i++) {
        const col = grid.columnOption(i);
        if (!col) continue;
        const isTarget = Boolean(sort && (col.dataField === sort.field || col.name === sort.field));
        const targetOrder = isTarget && sort ? toDxSortOrder(sort.order) : undefined;
        if (col.sortOrder !== targetOrder) {
          grid.columnOption(i, 'sortOrder', targetOrder);
        }
      }
      if (sort) {
        lastSyncedSortRef.current = { field: sort.field, order: sort.order };
      } else {
        lastSyncedSortRef.current = null;
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [sort]);

  // Sync on mount and whenever React-Admin sort changes externally
  useEffect(() => {
    syncGridSort();
  }, [syncGridSort]);

  const {
    onContentReady,
    onOptionChanged,
    onDisposing,
    layoutPreferenceKey,
    onSelectionChanged,
    onRowClick,
    children,
    noDataText,
    selection,
    rowClick,
    filtering,
    getRaFilters,
    getDxFilterValue,
    ...restProps
  } = props;

  const { handleLayoutContentReady, handleLayoutOptionChanged, handleLayoutDisposing } =
    useGridLayoutPersistence<RecordType>(layoutPreferenceKey);

  const { filterRowConfig, filterSyncEnabled, handleFilterOptionChanged, syncGridFilter } =
    useManagedFiltering<RecordType>({
      gridRef: innerRef,
      filtering,
      getRaFilters,
      getDxFilterValue,
      columns: props.columns,
      children,
    });

  // Configuration for DevExtreme selection locked to adapter invariants
  const selectionConfig = useMemo(() => {
    if (!selection) {
      return { mode: 'none' as const };
    }
    return {
      showCheckBoxesMode: 'always' as const,
      allowSelectAll: true,
      ...(typeof selection === 'object' ? selection : {}),
      mode: 'multiple' as const,
      deferred: false,
      selectAllMode: 'page' as const,
    };
  }, [selection]);

  // Set of current-page record IDs for fast intersection checks
  const currentPageIdSet = useMemo(() => {
    const set = new Set<RecordType['id']>();
    if (data) {
      for (let i = 0; i < data.length; i++) {
        const record = data[i];
        if (record) {
          set.add(record.id);
        }
      }
    }
    return set;
  }, [data]);

  // Controlled selectedRowKeys passed to DevExtreme containing only current-page selections
  const currentPageSelectedKeys = useMemo(() => {
    if (!selection || !selectedIds || selectedIds.length === 0) {
      return DEFAULT_EMPTY_ARRAY;
    }
    return selectedIds.filter((id) => currentPageIdSet.has(id as RecordType['id']));
  }, [selection, selectedIds, currentPageIdSet]);

  // Handle DevExtreme selection change, merging current-page selections with off-page IDs
  const handleSelectionChanged = useCallback(
    (e: DataGridSelectionChangedEvent<RecordType>) => {
      if (selection && onSelect) {
        const currentSelectedIds = selectedIds ?? DEFAULT_EMPTY_ARRAY;
        const offPageSelection = currentSelectedIds.filter(
          (id) => !currentPageIdSet.has(id as RecordType['id'])
        );
        const newSelection = [...offPageSelection, ...(e.selectedRowKeys as (string | number)[])];

        if (!areIdentifierSetsEqual(currentSelectedIds, newSelection)) {
          onSelect(newSelection);
        }
      }

      onSelectionChanged?.(e);
    },
    [selection, onSelect, selectedIds, currentPageIdSet, onSelectionChanged]
  );

  // Handle DevExtreme row clicks, triggering React-Admin navigation if enabled
  const handleRowClick = useCallback(
    (e: DataGridRowClickEvent<RecordType>) => {
      onRowClick?.(e);

      if (e.handled) {
        return;
      }

      if (!rowClick || (rowClick !== 'edit' && rowClick !== 'show')) {
        return;
      }

      if (e.rowType !== 'data') {
        return;
      }

      const target = e.event?.target as HTMLElement | null | undefined;
      if (
        target &&
        (target.closest?.('.dx-command-select') ||
          target.closest?.('.dx-select-checkbox') ||
          target.classList?.contains('dx-select-checkbox') ||
          target.closest?.('.dx-command-adaptive') ||
          target.closest?.('.dx-adaptive-detail-row') ||
          target.closest?.('.dx-datagrid-adaptive-more') ||
          target.classList?.contains('dx-datagrid-adaptive-more'))
      ) {
        return;
      }

      const record = e.data;
      if (!record || record.id === undefined) {
        return;
      }

      if (redirectRef.current) {
        redirectRef.current(rowClick, resource, record.id, record);
      }
    },
    [onRowClick, rowClick, resource]
  );

  // Compose onContentReady to sync column sort and filter state once columns are initialized
  const handleContentReady = useCallback(
    (e: DataGridContentReadyEvent<RecordType>) => {
      syncGridSort();
      syncGridFilter();
      handleLayoutContentReady(e);
      onContentReady?.(e);
    },
    [syncGridSort, syncGridFilter, handleLayoutContentReady, onContentReady]
  );

  // Compose onOptionChanged to intercept user column sorting and filtering
  const handleOptionChanged = useCallback(
    (e: DataGridOptionChangedEvent<RecordType>) => {
      handleFilterOptionChanged(e);
      handleLayoutOptionChanged(e);

      if (
        !isSyncingRef.current &&
        e.name === 'columns' &&
        typeof e.fullName === 'string' &&
        e.fullName.endsWith('.sortOrder')
      ) {
        const match = /^columns\[(\d+)\]\.sortOrder$/.exec(e.fullName);
        if (match) {
          const colIndex = Number(match[1]);
          const grid = innerRef.current?.instance();
          const column = grid?.columnOption(colIndex);

          if (
            column &&
            typeof column.dataField === 'string' &&
            column.dataField.trim() !== '' &&
            column.allowSorting !== false &&
            (e.value === 'asc' || e.value === 'desc')
          ) {
            const newField = column.dataField;
            const newOrder = toRaSortOrder(e.value);

            if (
              lastSyncedSortRef.current?.field !== newField ||
              lastSyncedSortRef.current?.order !== newOrder
            ) {
              lastSyncedSortRef.current = { field: newField, order: newOrder };
              setSort({ field: newField, order: newOrder });
            }
          }
        }
      }

      onOptionChanged?.(e);
    },
    [handleFilterOptionChanged, handleLayoutOptionChanged, onOptionChanged, setSort]
  );

  const handleDisposing = useCallback<NonNullable<DatagridDXProps<RecordType>['onDisposing']>>(
    (event) => {
      handleLayoutDisposing(event);
      onDisposing?.(event);
    },
    [handleLayoutDisposing, onDisposing]
  );

  return (
    <>
      {isInRouter && <NavigationBridge redirectRef={redirectRef} />}
      <DataGrid<RecordType, RecordType['id']>
        ref={innerRef}
        keyExpr="id"
        {...restProps}
        dataSource={data ?? DEFAULT_EMPTY_ARRAY}
        noDataText={isPending ? '' : (noDataText ?? 'No data')}
        paging={{ enabled: false }}
        sorting={{ mode: 'single' }}
        stateStoring={stateStoring}
        filterRow={filterRowConfig}
        filterSyncEnabled={filterSyncEnabled}
        selection={selectionConfig}
        selectedRowKeys={selection ? currentPageSelectedKeys : undefined}
        onContentReady={handleContentReady}
        onOptionChanged={handleOptionChanged}
        onDisposing={handleDisposing}
        onSelectionChanged={handleSelectionChanged}
        onRowClick={handleRowClick}
      >
        {children}
      </DataGrid>
    </>
  );
}) as <RecordType extends RaRecord = RaRecord>(
  props: DatagridDXProps<RecordType> & {
    ref?: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>;
  }
) => ReactElement | null;
