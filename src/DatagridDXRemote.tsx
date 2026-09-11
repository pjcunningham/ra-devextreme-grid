import { forwardRef, useMemo, type ForwardedRef, type ReactElement } from 'react';
import DataGrid, { type DataGridRef } from 'devextreme-react/data-grid';
import { useDataProvider, useResourceContext, type RaRecord } from 'react-admin';
import { createGridStore } from './remote/createGridStore';
import type { DatagridDXDataProvider } from './remote/types';
import type { DatagridDXRemoteProps } from './types';

const remoteOperations = {
  paging: true,
  sorting: true,
  filtering: true,
  grouping: false,
  summary: false,
  groupPaging: false,
};
const selection = { mode: 'none' } as const;
const grouping = { autoExpandAll: false, contextMenuEnabled: false };
const hidden = { visible: false };
const editing = { allowAdding: false, allowUpdating: false, allowDeleting: false };
const stateStoring = { enabled: false };

/** A read-only resource page. Do not wrap in React-Admin List or ListBase. */
export const DatagridDXRemote = forwardRef(function DatagridDXRemote<
  RecordType extends RaRecord = RaRecord,
>(
  { resource: resourceProp, paging, sorting, ...restProps }: DatagridDXRemoteProps<RecordType>,
  ref: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>
) {
  const contextResource = useResourceContext({ resource: resourceProp });
  const resource = resourceProp === '' ? '' : contextResource;
  const dataProvider = useDataProvider<DatagridDXDataProvider>();
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
  const store = useMemo(() => {
    if (!resource?.trim()) {
      throw new Error(
        'DatagridDXRemote requires a nonempty resource prop or React-Admin ResourceContext.'
      );
    }
    return createGridStore<RecordType>({ resource, dataProvider });
  }, [resource, dataProvider]);

  return (
    <DataGrid<RecordType, RecordType['id']>
      {...restProps}
      ref={ref}
      dataSource={store}
      defaultPaging={pagingOptions}
      sorting={sortingOptions}
      remoteOperations={remoteOperations}
      selection={selection}
      syncLookupFilterValues={false}
      grouping={grouping}
      groupPanel={hidden}
      headerFilter={hidden}
      filterPanel={hidden}
      searchPanel={hidden}
      editing={editing}
      stateStoring={stateStoring}
    />
  );
}) as <RecordType extends RaRecord = RaRecord>(
  props: DatagridDXRemoteProps<RecordType> & {
    ref?: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>;
  }
) => ReactElement | null;
