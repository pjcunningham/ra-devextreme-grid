import type { DataProvider, RaRecord } from 'react-admin';

export interface GetGridSortDescriptor {
  selector: string;
  desc: boolean;
}

export interface GetGridLoadOptions {
  skip?: number;
  take?: number;
  requireTotalCount?: boolean;
  sort?: GetGridSortDescriptor[];
  /**
   * Opaque native DevExtreme expression, not a library operator grammar.
   * Providers must narrow unknown values. Dates are preserved; executable values
   * are rejected at runtime. Serialization belongs to the application transport.
   */
  filter?: unknown[] | null;
}

export interface GetGridParams {
  loadOptions: GetGridLoadOptions;
}

export interface GetGridResult<RecordType extends RaRecord = RaRecord> {
  data: RecordType[];
  totalCount?: number;
}

export interface DatagridDXDataProvider extends DataProvider {
  getGrid<RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetGridParams
  ): Promise<GetGridResult<RecordType>>;
}
