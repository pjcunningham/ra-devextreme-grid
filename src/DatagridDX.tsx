import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ForwardedRef,
  type ReactElement,
} from 'react';
import { DataGrid, type DataGridRef } from 'devextreme-react/data-grid';
import { useListContext, type RaRecord } from 'react-admin';
import type { DatagridDXProps } from './types';

const DEFAULT_EMPTY_ARRAY: never[] = [];

/**
 * Managed DatagridDX component bridging React-Admin and DevExtreme DataGrid.
 *
 * Consumes records and loading state from React-Admin's ListContext.
 * Row keys are locked to canonical `record.id`. DevExtreme client-side
 * paging and sorting are disabled to preserve server-ordered page fidelity.
 */
export const DatagridDX = forwardRef(function DatagridDX<RecordType extends RaRecord = RaRecord>(
  props: DatagridDXProps<RecordType>,
  ref: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>
) {
  const { data, isPending, isFetching } = useListContext<RecordType>();
  const innerRef = useRef<DataGridRef<RecordType, RecordType['id']> | null>(null);

  useImperativeHandle(ref, () => innerRef.current as DataGridRef<RecordType, RecordType['id']>);

  useEffect(() => {
    const grid = innerRef.current?.instance();
    if (!grid) return;

    if (isPending || isFetching) {
      grid.beginCustomLoading('');
    } else {
      grid.endCustomLoading();
    }
  }, [isPending, isFetching]);

  const { children, noDataText, ...restProps } = props;

  return (
    <DataGrid<RecordType, RecordType['id']>
      ref={innerRef}
      keyExpr="id"
      {...restProps}
      dataSource={data ?? DEFAULT_EMPTY_ARRAY}
      noDataText={isPending ? '' : (noDataText ?? 'No data')}
      paging={{ enabled: false }}
      sorting={{ mode: 'none' }}
    >
      {children}
    </DataGrid>
  );
}) as <RecordType extends RaRecord = RaRecord>(
  props: DatagridDXProps<RecordType> & {
    ref?: ForwardedRef<DataGridRef<RecordType, RecordType['id']>>;
  }
) => ReactElement | null;
