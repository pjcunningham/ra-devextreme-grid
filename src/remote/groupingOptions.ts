import type dxDataGrid from 'devextreme/ui/data_grid';
import type { RaRecord } from 'react-admin';
import { MAX_GROUP_LEVELS } from './loadOptions';

/** Guard semantic options that native nested components can set before the first load. */
export function validateGroupingOptions<RecordType extends RaRecord>(
  grid: dxDataGrid<RecordType, RecordType['id']> | null
): void {
  if (!grid) return;
  if (grid.option('grouping.autoExpandAll') !== true) {
    throw new Error(
      'DatagridDXRemote grouping.autoExpandAll must be true; collapsed server groups require Phase 8C.'
    );
  }
  const operations = grid.option('remoteOperations');
  if (
    !operations ||
    typeof operations !== 'object' ||
    operations.groupPaging !== false ||
    operations.grouping !== true
  ) {
    throw new Error(
      'DatagridDXRemote requires remote grouping with groupPaging=false (Phase 8C is unsupported).'
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
      if (column.autoExpandGroup === false) {
        throw new Error('DatagridDXRemote column.autoExpandGroup=false requires Phase 8C.');
      }
      if (typeof column.calculateGroupValue === 'function') {
        throw new Error('DatagridDXRemote calculateGroupValue must be a string, not a function.');
      }
      if (typeof column.groupIndex === 'number' && column.groupIndex >= 0) levels += 1;
      inspectColumns(column.columns);
    }
  };
  inspectColumns(grid.option('columns'));
  if (levels > MAX_GROUP_LEVELS) {
    throw new Error(`DatagridDXRemote supports at most ${MAX_GROUP_LEVELS} group levels.`);
  }
}
