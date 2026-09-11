import type { DataProvider, RaRecord } from 'react-admin';

export interface GetGridSortDescriptor {
  selector: string;
  desc: boolean;
  /** Native parent-group sort metadata on lazy leaf requests. */
  isExpanded?: boolean;
}

export interface GetGridGroupDescriptor {
  selector: string;
  desc: boolean;
  isExpanded: boolean;
}

export type GetGridGroupKey = string | number | boolean | null;

export interface GetGridGroupItem<RecordType extends RaRecord = RaRecord> {
  key: GetGridGroupKey;
  items: Array<RecordType | GetGridGroupItem<RecordType>> | null;
  /** Complete matching record count; required when items is null. */
  count?: number;
  summary?: GetGridSummaryValue[];
}

/** Disambiguates native scope predicates from case-insensitive user filters. */
export interface GetGridGroupPagingContext {
  group: GetGridGroupDescriptor[];
  filter: unknown[] | null;
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
  /** Present only for an active group-paging query, including independent leaf loads. */
  groupPagingContext?: GetGridGroupPagingContext;
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
