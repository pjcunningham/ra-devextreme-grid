import type { IDataGridOptions } from 'devextreme-react/data-grid';
import type { RaRecord } from 'react-admin';

/**
 * Props accepted by the DatagridDX component.
 *
 * In managed mode, `dataSource` and `keyExpr` are owned by the adapter
 * and wired to React-Admin's ListContext records and canonical `record.id`.
 */
export type DatagridDXProps<RecordType extends RaRecord = RaRecord> = Omit<
  IDataGridOptions<RecordType, RecordType['id']>,
  'dataSource' | 'keyExpr'
>;
