import type { DataProvider, RaRecord } from 'react-admin';

export interface GetGridSortDescriptor {
  selector: string;
  desc: boolean;
}

export interface GetGridGroupDescriptor {
  selector: string;
  desc: boolean;
  isExpanded: boolean;
}

export type GetGridGroupKey = string | number | boolean | null;

export interface GetGridGroupItem<RecordType extends RaRecord = RaRecord> {
  key: GetGridGroupKey;
  items: Array<RecordType | GetGridGroupItem<RecordType>>;
  summary?: GetGridSummaryValue[];
}

export type GetGridSummaryType = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type GetGridSummaryDescriptor =
  | { summaryType: 'count'; selector?: string }
  | { summaryType: Exclude<GetGridSummaryType, 'count'>; selector: string };

export type GetGridSummaryValue = string | number | boolean | null;

export interface GetGridLoadOptions {
  skip?: number;
  take?: number;
  requireTotalCount?: boolean;
  requireGroupCount?: boolean;
  sort?: GetGridSortDescriptor[];
  group?: GetGridGroupDescriptor[];
  /**
   * Opaque native DevExtreme expression, not a library operator grammar.
   * Providers must narrow unknown values. Dates are preserved; executable values
   * are rejected at runtime. Serialization belongs to the application transport.
   */
  filter?: unknown[] | null;
  totalSummary?: GetGridSummaryDescriptor[];
  groupSummary?: GetGridSummaryDescriptor[];
}

export interface GetGridParams {
  loadOptions: GetGridLoadOptions;
}

export interface GetGridResult<RecordType extends RaRecord = RaRecord> {
  data: RecordType[] | GetGridGroupItem<RecordType>[];
  totalCount?: number;
  groupCount?: number;
  summary?: GetGridSummaryValue[];
}

export interface DatagridDXDataProvider extends DataProvider {
  getGrid<RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetGridParams
  ): Promise<GetGridResult<RecordType>>;
}
