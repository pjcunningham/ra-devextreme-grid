import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
  type ReactElement,
} from 'react';
import { DataGrid, type DataGridRef, type IDataGridOptions } from 'devextreme-react/data-grid';
import { useListContext, type RaRecord, type SortPayload } from 'react-admin';
import type { DatagridDXProps } from './types';
import { toDxSortOrder, toRaSortOrder } from './sortUtils';

const DEFAULT_EMPTY_ARRAY: never[] = [];

type DataGridContentReadyEvent<RecordType extends RaRecord = RaRecord> = Parameters<
  NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onContentReady']>
>[0];

type DataGridOptionChangedEvent<RecordType extends RaRecord = RaRecord> = Parameters<
  NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onOptionChanged']>
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
  const { data, isPending, isFetching, sort, setSort } = useListContext<RecordType>();
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

  const { onContentReady, onOptionChanged, children, noDataText, ...restProps } = props;

  // Compose onContentReady to sync column sort state once columns are initialized
  const handleContentReady = useCallback(
    (e: DataGridContentReadyEvent<RecordType>) => {
      syncGridSort();
      onContentReady?.(e);
    },
    [syncGridSort, onContentReady]
  );

  // Compose onOptionChanged to intercept user column sorting
  const handleOptionChanged = useCallback(
    (e: DataGridOptionChangedEvent<RecordType>) => {
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
    [onOptionChanged, setSort]
  );

  return (
    <DataGrid<RecordType, RecordType['id']>
      ref={innerRef}
      keyExpr="id"
      {...restProps}
      dataSource={data ?? DEFAULT_EMPTY_ARRAY}
      noDataText={isPending ? '' : (noDataText ?? 'No data')}
      paging={{ enabled: false }}
      sorting={{ mode: 'single' }}
      onContentReady={handleContentReady}
      onOptionChanged={handleOptionChanged}
    >
      {children}
    </DataGrid>
  );
}) as <RecordType extends RaRecord = RaRecord>(
  props: DatagridDXProps<RecordType> & {
    ref?: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>;
  }
) => ReactElement | null;
