import type { IDataGridOptions } from 'devextreme-react/data-grid';
import type { IPaginationOptions } from 'devextreme-react/pagination';
import type { RaRecord } from 'react-admin';

/**
 * Props accepted by the DatagridDX component.
 *
 * In managed mode, `dataSource`, `keyExpr`, `paging`, `pager`, `sorting`,
 * and `remoteOperations` are owned by the adapter to preserve React-Admin
 * data ownership, server-side paging, and single-column sorting.
 */
export type DatagridDXProps<RecordType extends RaRecord = RaRecord> = Omit<
  IDataGridOptions<RecordType, RecordType['id']>,
  'dataSource' | 'keyExpr' | 'paging' | 'pager' | 'sorting' | 'remoteOperations'
>;

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
