import type { IDataGridOptions } from 'devextreme-react/data-grid';
import type { IPaginationOptions } from 'devextreme-react/pagination';
import type { FilterRow as DxGridFilterRow } from 'devextreme/common/grids';
import type {
  Selection as DxGridSelection,
  Summary as DxGridSummary,
  SummaryTotalItem as DxGridSummaryTotalItem,
  SummaryGroupItem as DxGridSummaryGroupItem,
} from 'devextreme/ui/data_grid';
import type { RaRecord } from 'react-admin';
import type { GetGridSummaryType } from './remote/types';

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

type DatagridDXRemoteSummaryTotalItem = Omit<
  DxGridSummaryTotalItem,
  'summaryType' | 'skipEmptyValues'
> & {
  skipEmptyValues?: true;
} & (
    { summaryType: 'count' } | { summaryType: Exclude<GetGridSummaryType, 'count'>; column: string }
  );

export type DatagridDXRemoteSummaryGroupItem = Omit<
  DxGridSummaryGroupItem,
  'summaryType' | 'skipEmptyValues'
> & {
  skipEmptyValues?: true;
} & (
    { summaryType: 'count' } | { summaryType: Exclude<GetGridSummaryType, 'count'>; column: string }
  );

/**
 * Native total/group-summary presentation with supported remote aggregate semantics.
 * Custom calculation and editing recalculation are not exposed.
 */
export type DatagridDXRemoteSummaryOptions = Omit<
  DxGridSummary,
  | 'calculateCustomSummary'
  | 'groupItems'
  | 'recalculateWhileEditing'
  | 'totalItems'
  | 'skipEmptyValues'
> & {
  totalItems?: DatagridDXRemoteSummaryTotalItem[];
  groupItems?: DatagridDXRemoteSummaryGroupItem[];
  skipEmptyValues?: true;
};

/** autoExpandAll must be true in complete-tree mode, false with groupPaging. */
export type DatagridDXRemoteGroupingOptions = Omit<
  NonNullable<IDataGridOptions['grouping']>,
  'autoExpandAll'
> & {
  autoExpandAll?: boolean;
};

/**
 * Read-only remote grid options. DevExtreme owns native query state; do not use
 * inside List/ListBase or with DatagridDXPagination. Nested native components
 * and imperative APIs must also respect the documented remote-operation limitations.
 */
export type DatagridDXRemoteProps<RecordType extends RaRecord = RaRecord> = Omit<
  IDataGridOptions<RecordType, RecordType['id']>,
  | 'dataSource'
  | 'keyExpr'
  | 'remoteOperations'
  | 'paging'
  | 'defaultPaging'
  | 'stateStoring'
  | 'grouping'
  | 'defaultGroupPanel'
  | 'onGroupPanelChange'
  | 'sortByGroupSummaryInfo'
  | 'defaultSortByGroupSummaryInfo'
  | 'onSortByGroupSummaryInfoChange'
  | 'summary'
  | 'headerFilter'
  | 'filterBuilder'
  | 'filterBuilderPopup'
  | 'filterPanel'
  | 'searchPanel'
  | 'editing'
  | 'defaultEditing'
  | 'onEditingChange'
  | 'onEditingStart'
  | 'onEditCanceling'
  | 'onEditCanceled'
  | 'onInitNewRow'
  | 'onRowInserting'
  | 'onRowInserted'
  | 'onRowUpdating'
  | 'onRowUpdated'
  | 'onRowRemoving'
  | 'onRowRemoved'
  | 'onRowValidating'
  | 'onSaving'
  | 'onSaved'
  | 'selection'
  | 'selectedRowKeys'
  | 'defaultSelectedRowKeys'
  | 'onSelectedRowKeysChange'
  | 'selectionFilter'
  | 'defaultSelectionFilter'
  | 'onSelectionFilterChange'
  | 'onSelectionChanged'
  | 'syncLookupFilterValues'
> & {
  resource?: string;
  /** Opt into lazy remote groups; requires autoExpandAll=false and no expandAll(). */
  groupPaging?: boolean;
  paging?: Omit<NonNullable<IDataGridOptions<RecordType, RecordType['id']>['paging']>, 'enabled'>;
  grouping?: DatagridDXRemoteGroupingOptions;
  summary?: DatagridDXRemoteSummaryOptions;
};
