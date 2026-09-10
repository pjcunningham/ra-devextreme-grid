import { useCallback, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react';
import type { DataGridRef, IDataGridOptions } from 'devextreme-react/data-grid';
import { useListContext, type RaRecord } from 'react-admin';
import type {
  DatagridDXFilterRowOptions,
  DatagridDXGetDxFilterValue,
  DatagridDXGetRaFilters,
} from './types';
import {
  defaultGetDxFilterValue,
  defaultGetRaFilters,
  getManagedColumnFields,
  isFilterValueEqual,
} from './filterUtils';

export interface UseManagedFilteringOptions<RecordType extends RaRecord = RaRecord> {
  gridRef: RefObject<DataGridRef<RecordType, RecordType['id']> | null>;
  filtering?: boolean | DatagridDXFilterRowOptions;
  getRaFilters?: DatagridDXGetRaFilters;
  getDxFilterValue?: DatagridDXGetDxFilterValue;
  columns?: unknown[];
  children?: ReactNode;
}

export function useManagedFiltering<RecordType extends RaRecord = RaRecord>({
  gridRef,
  filtering,
  getRaFilters,
  getDxFilterValue,
  columns,
  children,
}: UseManagedFilteringOptions<RecordType>) {
  const { filterValues, setFilters, displayedFilters } = useListContext<RecordType>();

  const isFilteringSyncingRef = useRef(false);
  const lastSyncedFilterRef = useRef<unknown>(null);

  const managedColumns = useMemo(
    () => getManagedColumnFields(columns, children),
    [columns, children]
  );

  const filterRowConfig = useMemo(() => {
    if (!filtering) {
      return { visible: false };
    }
    const customOptions = typeof filtering === 'object' ? filtering : {};
    return {
      visible: true,
      showOperationChooser: true,
      applyFilter: 'auto' as const,
      ...customOptions,
    };
  }, [filtering]);

  const syncGridFilter = useCallback(() => {
    if (!filtering) return;

    const grid = gridRef.current?.instance();
    if (!grid) return;

    const effectiveGetDxFilter = getDxFilterValue ?? defaultGetDxFilterValue;
    const expectedDxFilter = effectiveGetDxFilter(filterValues, {
      gridColumns: managedColumns,
    });

    const currentDxFilter = grid.option('filterValue');
    if (
      isFilterValueEqual(lastSyncedFilterRef.current, expectedDxFilter) &&
      isFilterValueEqual(currentDxFilter, expectedDxFilter)
    ) {
      return;
    }

    isFilteringSyncingRef.current = true;
    try {
      lastSyncedFilterRef.current = expectedDxFilter;
      grid.option(
        'filterValue',
        expectedDxFilter as
          string | ((...args: unknown[]) => unknown) | unknown[] | null | undefined
      );
    } finally {
      isFilteringSyncingRef.current = false;
    }
  }, [filtering, filterValues, getDxFilterValue, managedColumns, gridRef]);

  useEffect(() => {
    syncGridFilter();
  }, [syncGridFilter]);

  const handleFilterOptionChanged = useCallback(
    (
      e: Parameters<
        NonNullable<IDataGridOptions<RecordType, RecordType['id']>['onOptionChanged']>
      >[0]
    ) => {
      if (!filtering) return;

      if (!isFilteringSyncingRef.current && e.name === 'filterValue') {
        const nextDxFilter = e.value;
        if (isFilterValueEqual(lastSyncedFilterRef.current, nextDxFilter)) {
          return;
        }

        lastSyncedFilterRef.current = nextDxFilter;
        const effectiveGetRaFilters = getRaFilters ?? defaultGetRaFilters;
        const nextRaFilters = effectiveGetRaFilters(nextDxFilter, {
          previousFilters: filterValues,
          gridColumns: managedColumns,
        });

        setFilters(nextRaFilters, displayedFilters, true);
      }
    },
    [filtering, filterValues, displayedFilters, getRaFilters, managedColumns, setFilters]
  );

  return {
    filterRowConfig,
    filterSyncEnabled: filtering ? true : undefined,
    handleFilterOptionChanged,
    syncGridFilter,
  };
}
