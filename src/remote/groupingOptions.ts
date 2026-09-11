import type dxDataGrid from 'devextreme/ui/data_grid';
import type { RaRecord } from 'react-admin';
import { MAX_GROUP_LEVELS, normalizeGroup } from './loadOptions';
import type { GetGridGroupPagingContext } from './types';

export function readGroupPagingContext<RecordType extends RaRecord>(
  grid: dxDataGrid<RecordType, RecordType['id']> | null
): GetGridGroupPagingContext | undefined {
  const groups = grid?.getDataSource()?.group();
  if (!groups || (Array.isArray(groups) && groups.length === 0)) return undefined;
  return {
    group: normalizeGroup(groups, true),
    filter: grid!.getCombinedFilter(true) ?? null,
  };
}

/** Guard semantic options that native nested components can set before the first load. */
export function validateGroupingOptions<RecordType extends RaRecord>(
  grid: dxDataGrid<RecordType, RecordType['id']> | null,
  groupPaging = false
): void {
  if (!grid) return;
  if (grid.option('grouping.autoExpandAll') !== !groupPaging) {
    throw new Error(
      `DatagridDXRemote grouping.autoExpandAll must be ${!groupPaging} with groupPaging=${groupPaging}.`
    );
  }
  const operations = grid.option('remoteOperations');
  if (
    !operations ||
    typeof operations !== 'object' ||
    operations.groupPaging !== groupPaging ||
    operations.grouping !== true ||
    (groupPaging &&
      [operations.paging, operations.sorting, operations.filtering, operations.summary].some(
        (value) => value !== true
      ))
  ) {
    throw new Error(
      `DatagridDXRemote requires remote grouping with groupPaging=${groupPaging}${groupPaging ? ' and all operations remote' : ''}.`
    );
  }
  const summarySort = grid.option('sortByGroupSummaryInfo');
  if (summarySort != null && (!Array.isArray(summarySort) || summarySort.length > 0)) {
    throw new Error('DatagridDXRemote sortByGroupSummaryInfo is not supported.');
  }
  if (grid.option('headerFilter.visible')) {
    throw new Error('DatagridDXRemote Header Filter is not supported.');
  }
  let levels = 0;
  const inspectColumns = (columns: unknown): void => {
    if (!Array.isArray(columns)) return;
    for (const column of columns) {
      if (!column || typeof column !== 'object') continue;
      if (!groupPaging && column.autoExpandGroup === false) {
        throw new Error('DatagridDXRemote column.autoExpandGroup=false requires groupPaging.');
      }
      if (typeof column.calculateGroupValue === 'function') {
        throw new Error('DatagridDXRemote calculateGroupValue must be a string, not a function.');
      }
      if (typeof column.groupIndex === 'number' && column.groupIndex >= 0) {
        levels += 1;
        if (groupPaging && column.autoExpandGroup !== false) {
          throw new Error(
            `DatagridDXRemote grouped column ${String(column.name ?? column.dataField ?? column.caption ?? column.groupIndex)} must set autoExpandGroup=false with groupPaging.`
          );
        }
      }
      inspectColumns(column.columns);
    }
  };
  inspectColumns(grid.option('columns'));
  if (levels > MAX_GROUP_LEVELS) {
    throw new Error(`DatagridDXRemote supports at most ${MAX_GROUP_LEVELS} group levels.`);
  }
}
