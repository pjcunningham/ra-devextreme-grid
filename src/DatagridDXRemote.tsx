import {
  forwardRef,
  useMemo,
  useRef,
  useCallback,
  type ForwardedRef,
  type ReactElement,
} from 'react';
import DataGrid, { type DataGridRef } from 'devextreme-react/data-grid';
import type dxDataGrid from 'devextreme/ui/data_grid';
import { useDataProvider, useResourceContext, type RaRecord } from 'react-admin';
import { createGridStore } from './remote/createGridStore';
import { validateSummaryOptions } from './remote/summaryOptions';
import { validateGroupingOptions } from './remote/groupingOptions';
import type { DatagridDXDataProvider } from './remote/types';
import type { DatagridDXRemoteProps } from './types';

const remoteOperations = {
  paging: true,
  sorting: true,
  filtering: true,
  grouping: true,
  summary: true,
  groupPaging: false,
};
const selection = { mode: 'none' } as const;
const hidden = { visible: false };
const editing = { allowAdding: false, allowUpdating: false, allowDeleting: false };
const stateStoring = { enabled: false };

/** A read-only resource page. Do not wrap in React-Admin List or ListBase. */
export const DatagridDXRemote = forwardRef(function DatagridDXRemote<
  RecordType extends RaRecord = RaRecord,
>(
  {
    resource: resourceProp,
    paging,
    sorting,
    grouping: groupingProp,
    groupPanel,
    onInitialized,
    onOptionChanged,
    onDisposing,
    ...restProps
  }: DatagridDXRemoteProps<RecordType>,
  ref: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>
) {
  const contextResource = useResourceContext({ resource: resourceProp });
  const resource = resourceProp === '' ? '' : contextResource;
  const dataProvider = useDataProvider<DatagridDXDataProvider>();
  const instance = useRef<dxDataGrid<RecordType, RecordType['id']> | null>(null);
  const validateBeforeLoad = useCallback(() => {
    validateSummaryOptions(instance.current?.option('summary'));
    validateGroupingOptions(instance.current);
  }, []);
  const handleInitialized = useCallback<
    NonNullable<DatagridDXRemoteProps<RecordType>['onInitialized']>
  >(
    (event) => {
      instance.current = event.component ?? null;
      validateBeforeLoad();
      onInitialized?.(event);
    },
    [onInitialized, validateBeforeLoad]
  );
  const handleOptionChanged = useCallback<
    NonNullable<DatagridDXRemoteProps<RecordType>['onOptionChanged']>
  >(
    (event) => {
      if (event.name === 'summary') validateSummaryOptions(event.component.option('summary'));
      if (
        [
          'grouping',
          'columns',
          'remoteOperations',
          'sortByGroupSummaryInfo',
          'headerFilter',
        ].includes(event.name)
      ) {
        validateGroupingOptions(event.component);
      }
      onOptionChanged?.(event);
    },
    [onOptionChanged]
  );
  const handleDisposing = useCallback<
    NonNullable<DatagridDXRemoteProps<RecordType>['onDisposing']>
  >(
    (event) => {
      instance.current = null;
      onDisposing?.(event);
    },
    [onDisposing]
  );
  const { pageIndex, pageSize } = paging ?? {};
  const pagingOptions = useMemo(
    () => ({
      enabled: true,
      ...(pageIndex === undefined ? {} : { pageIndex }),
      ...(pageSize === undefined ? {} : { pageSize }),
    }),
    [pageIndex, pageSize]
  );
  const sortingOptions = useMemo(() => ({ mode: 'multiple' as const, ...sorting }), [sorting]);
  const operationOptions = useMemo(() => ({ ...remoteOperations }), []);
  const hiddenOptions = useMemo(
    () => ({ header: { ...hidden }, filter: { ...hidden }, search: { ...hidden } }),
    []
  );
  const store = useMemo(() => {
    if (!resource?.trim()) {
      throw new Error(
        'DatagridDXRemote requires a nonempty resource prop or React-Admin ResourceContext.'
      );
    }
    return createGridStore<RecordType>({ resource, dataProvider, validateBeforeLoad });
  }, [resource, dataProvider, validateBeforeLoad]);

  return (
    <DataGrid<RecordType, RecordType['id']>
      {...restProps}
      ref={ref}
      onInitialized={handleInitialized}
      onOptionChanged={handleOptionChanged}
      onDisposing={handleDisposing}
      dataSource={store}
      defaultPaging={pagingOptions}
      sorting={sortingOptions}
      remoteOperations={operationOptions}
      selection={selection}
      syncLookupFilterValues={false}
      {...(groupingProp === undefined ? {} : { grouping: groupingProp })}
      {...(groupPanel === undefined ? {} : { groupPanel })}
      headerFilter={hiddenOptions.header}
      filterPanel={hiddenOptions.filter}
      searchPanel={hiddenOptions.search}
      editing={editing}
      stateStoring={stateStoring}
    />
  );
}) as <RecordType extends RaRecord = RaRecord>(
  props: DatagridDXRemoteProps<RecordType> & {
    ref?: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>;
  }
) => ReactElement | null;
