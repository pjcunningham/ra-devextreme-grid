import type { IDataGridOptions } from 'devextreme-react/data-grid';
import type { IPaginationOptions } from 'devextreme-react/pagination';
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
 * Props accepted by the DatagridDX component.
 *
 * In managed mode, `dataSource`, `keyExpr`, `paging`, `pager`, `sorting`,
 * `remoteOperations`, and native selection configuration are owned by the adapter
 * to preserve React-Admin data ownership, server-side paging, single-column sorting,
 * and cross-page selection persistence.
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
> & {
  selection?: boolean | DatagridDXSelectionOptions;
  rowClick?: DatagridDXRowClick;
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
