import React from 'react';
import DataGrid from 'devextreme-react/data-grid';
import type { DatagridDXProps } from './types';

/**
 * Proof-of-installation DatagridDX component bridging React-Admin and DevExtreme DataGrid.
 *
 * For Phase 0, this component renders static data and passes through native
 * DevExtreme DataGrid options and child columns without prematurely coupling to
 * React-Admin ListContext.
 */
export function DatagridDX<RecordType = Record<string, unknown>, KeyType = unknown>({
  data,
  dataSource,
  children,
  ...restProps
}: DatagridDXProps<RecordType, KeyType>): React.JSX.Element {
  const resolvedDataSource = data ?? dataSource;

  return (
    <DataGrid dataSource={resolvedDataSource} {...restProps}>
      {children}
    </DataGrid>
  );
}
