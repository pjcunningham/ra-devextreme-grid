import type { IDataGridOptions } from 'devextreme-react/data-grid';
import type { IPaginationOptions } from 'devextreme-react/pagination';
import type { FilterRow as DxGridFilterRow } from 'devextreme/common/grids';
import type { Selection as DxGridSelection } from 'devextreme/ui/data_grid';
import type { RaRecord } from 'react-admin';

/**
 * Safe presentation options for DataGrid selection in managed mode.
 *
 * Semantic options `mode`, `deferred`, and `selectAllMode` are owned by the adapter
 * to guarantee React-Admin multi-row selection, current-page projection,
 * and concrete identifier management.
 */
export type DatagridDXSelectionOptions = Omit<
  DxGridSelection,
  'mode' | 'deferred' | 'selectAllMode'
>;

/**
 * React-Admin navigation destination triggered on data row clicks.
 */
export type DatagridDXRowClick = 'edit' | 'show' | false;

/**
 * Safe presentation and interaction options for DataGrid Filter Row in managed mode.
 *
 * The `visible` option is owned by the adapter via the boolean/options `filtering` prop.
 */
export type DatagridDXFilterRowOptions = Omit<DxGridFilterRow, 'visible'>;

/**
 * Filter context passed to conversion callbacks.
 */
export interface DatagridDXFilterContext {
  previousFilters?: Record<string, unknown>;
  gridColumns?: string[];
}

/**
 * Custom callback signature to convert a DevExtreme filter expression into a React-Admin filter object.
 */
export type DatagridDXGetRaFilters = (
  dxFilter: unknown,
  context: DatagridDXFilterContext
) => Record<string, unknown>;

/**
 * Custom callback signature to convert a React-Admin filter object into a DevExtreme filter expression.
 */
export type DatagridDXGetDxFilterValue = (
  raFilters: Record<string, unknown> | undefined | null,
  context: { gridColumns?: string[] }
) => unknown;

/**
 * Props accepted by the DatagridDX component.
 *
 * In managed mode, `dataSource`, `keyExpr`, `paging`, `pager`, `sorting`,
 * `remoteOperations`, `stateStoring`, selection, and filtering configuration are owned by the adapter
 * to preserve React-Admin data ownership, server-side paging, single-column sorting,
 * cross-page selection persistence, and debounced list filtering. Native `stateStoring`
 * is intentionally omitted to prevent competing state ownership.
 */
export type DatagridDXProps<RecordType extends RaRecord = RaRecord> = Omit<
  IDataGridOptions<RecordType, RecordType['id']>,
  | 'dataSource'
  | 'keyExpr'
  | 'paging'
  | 'pager'
  | 'sorting'
  | 'remoteOperations'
  | 'selection'
  | 'selectedRowKeys'
  | 'defaultSelectedRowKeys'
  | 'selectionFilter'
  | 'defaultSelectionFilter'
  | 'filterRow'
  | 'filterValue'
  | 'defaultFilterValue'
  | 'filterSyncEnabled'
  | 'headerFilter'
  | 'filterPanel'
  | 'filterBuilder'
  | 'filterBuilderPopup'
  | 'searchPanel'
  | 'stateStoring'
> & {
  selection?: boolean | DatagridDXSelectionOptions;
  rowClick?: DatagridDXRowClick;
  filtering?: boolean | DatagridDXFilterRowOptions;
  getRaFilters?: DatagridDXGetRaFilters;
  getDxFilterValue?: DatagridDXGetDxFilterValue;
};

/**
 * Props accepted by the DatagridDXPagination component.
 *
 * Pagination state (`pageIndex`, `pageSize`, `itemCount`) and event handlers
 * are owned by the adapter and wired to React-Admin's ListContext.
 */
export type DatagridDXPaginationProps = Omit<
  IPaginationOptions,
  | 'pageIndex'
  | 'pageSize'
  | 'itemCount'
  | 'defaultPageIndex'
  | 'defaultPageSize'
  | 'onPageIndexChange'
  | 'onPageSizeChange'
>;
