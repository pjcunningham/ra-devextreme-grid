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
}: {
  resource: string;
  dataProvider: DatagridDXDataProvider;
}): CustomStore<RecordType, RecordType['id']> {
  return new CustomStore<RecordType, RecordType['id']>({
    key: 'id',
    loadMode: 'processed',
    load: async (options) => {
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
      const { totalCount } = result;
      if (loadOptions.requireTotalCount || totalCount !== undefined) {
        if (typeof totalCount !== 'number' || !Number.isFinite(totalCount) || totalCount < 0) {
          throw new Error(
            'DatagridDXRemote getGrid totalCount must be a finite non-negative number when supplied or requested.'
          );
        }
      }
      const converted: LoadResultObject<RecordType> = { data: result.data };
      if (totalCount !== undefined) converted.totalCount = totalCount;
      return converted;
    },
  });
}
