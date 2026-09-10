import type React from 'react';
import type { IDataGridOptions } from 'devextreme-react/data-grid';

/**
 * Props accepted by the DatagridDX component.
 */
export interface DatagridDXProps<
  RecordType = Record<string, unknown>,
  KeyType = unknown,
> extends Omit<IDataGridOptions<RecordType, KeyType>, 'dataSource'> {
  /**
   * Static or pre-loaded record array.
   */
  data?: RecordType[];

  /**
   * DevExtreme native dataSource (passed through if `data` is omitted).
   */
  dataSource?: IDataGridOptions<RecordType, KeyType>['dataSource'];

  /**
   * Child elements, such as DevExtreme `<Column />` configurations.
   */
  children?: React.ReactNode;
}
