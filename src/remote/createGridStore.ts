import CustomStore from 'devextreme/data/custom_store';
import type { LoadResultObject } from 'devextreme/common/data';
import type { RaRecord } from 'react-admin';
import { normalizeLoadOptions } from './loadOptions';
import type { DatagridDXDataProvider } from './types';

const missingMethod =
  'DatagridDXRemote requires the React-Admin dataProvider to implement getGrid(resource, params).';

export function createGridStore<RecordType extends RaRecord>({
  resource,
  dataProvider,
  validateBeforeLoad,
}: {
  resource: string;
  dataProvider: DatagridDXDataProvider;
  validateBeforeLoad?: () => void;
}): CustomStore<RecordType, RecordType['id']> {
  return new CustomStore<RecordType, RecordType['id']>({
    key: 'id',
    loadMode: 'processed',
    load: async (options) => {
      validateBeforeLoad?.();
      const loadOptions = normalizeLoadOptions(options);
      // React-Admin's get trap returns a function even for absent methods.
      if (!('getGrid' in dataProvider) || typeof dataProvider.getGrid !== 'function') {
        throw new Error(missingMethod);
      }
      let request;
      try {
        request = dataProvider.getGrid<RecordType>(resource, { loadOptions });
      } catch (error) {
        // The public wrapper reports non-callable properties synchronously.
        if (error instanceof Error && error.message === 'Unknown dataProvider function: getGrid') {
          throw new Error(missingMethod);
        }
        throw error;
      }
      const result = await request;
      if (!result || typeof result !== 'object' || !Array.isArray(result.data)) {
        throw new Error('DatagridDXRemote getGrid must return an object with a data array.');
      }
      const { totalCount, summary } = result;
      if (loadOptions.requireTotalCount || totalCount !== undefined) {
        if (typeof totalCount !== 'number' || !Number.isFinite(totalCount) || totalCount < 0) {
          throw new Error(
            'DatagridDXRemote getGrid totalCount must be a finite non-negative number when supplied or requested.'
          );
        }
      }
      const converted: LoadResultObject<RecordType> = { data: result.data };
      if (totalCount !== undefined) converted.totalCount = totalCount;
      if (loadOptions.totalSummary?.length) {
        if (!Array.isArray(summary) || summary.length !== loadOptions.totalSummary.length) {
          throw new Error(
            'DatagridDXRemote getGrid summary must be an array matching totalSummary length.'
          );
        }
        for (const value of summary) {
          if (
            value !== null &&
            typeof value !== 'string' &&
            typeof value !== 'boolean' &&
            !(typeof value === 'number' && Number.isFinite(value))
          ) {
            throw new Error('DatagridDXRemote getGrid summary values must be JSON-safe scalars.');
          }
        }
        converted.summary = summary;
      } else if (summary !== undefined) {
        throw new Error('DatagridDXRemote getGrid returned an unsolicited summary.');
      }
      return converted;
    },
  });
}
