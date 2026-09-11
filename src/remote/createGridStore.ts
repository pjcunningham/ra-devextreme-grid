import CustomStore from 'devextreme/data/custom_store';
import type { LoadResultObject } from 'devextreme/common/data';
import type { RaRecord } from 'react-admin';
import { normalizeLoadOptions } from './loadOptions';
import { validateGridData, validateSummaryResult } from './groupResults';
import type { DatagridDXDataProvider, GetGridGroupPagingContext } from './types';

const missingMethod =
  'DatagridDXRemote requires the React-Admin dataProvider to implement getGrid(resource, params).';

export function createGridStore<RecordType extends RaRecord>({
  resource,
  dataProvider,
  validateBeforeLoad,
  groupPaging = false,
  getGroupPagingContext,
}: {
  resource: string;
  dataProvider: DatagridDXDataProvider;
  validateBeforeLoad?: () => void;
  groupPaging?: boolean;
  getGroupPagingContext?: () => GetGridGroupPagingContext | undefined;
}): CustomStore<RecordType, RecordType['id']> {
  return new CustomStore<RecordType, RecordType['id']>({
    key: 'id',
    loadMode: 'processed',
    load: async (options) => {
      validateBeforeLoad?.();
      const loadOptions = normalizeLoadOptions(options, {
        groupPaging,
        groupPagingContext: getGroupPagingContext?.(),
      });
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
      const { totalCount, groupCount, summary } = result;
      if (loadOptions.requireTotalCount || totalCount !== undefined) {
        if (typeof totalCount !== 'number' || !Number.isFinite(totalCount) || totalCount < 0) {
          throw new Error(
            'DatagridDXRemote getGrid totalCount must be a finite non-negative number when supplied or requested.'
          );
        }
      }
      if (loadOptions.requireGroupCount) {
        if (
          typeof groupCount !== 'number' ||
          !Number.isFinite(groupCount) ||
          !Number.isInteger(groupCount) ||
          groupCount < 0
        ) {
          throw new Error(
            'DatagridDXRemote getGrid groupCount must be a finite non-negative integer when requested.'
          );
        }
      } else if (groupCount !== undefined) {
        throw new Error('DatagridDXRemote getGrid returned an unsolicited groupCount.');
      }
      validateSummaryResult(summary, loadOptions.totalSummary?.length, 'summary');
      const configuredGroups = loadOptions.groupPagingContext?.group;
      const groupDepth = loadOptions.group?.length
        ? configuredGroups
          ? configuredGroups.length -
            configuredGroups.findIndex(
              (descriptor) => descriptor.selector === loadOptions.group![0]!.selector
            )
          : loadOptions.group.length
        : 0;
      validateGridData(
        result.data,
        groupDepth,
        loadOptions.groupSummary?.length,
        loadOptions.groupPagingContext !== undefined
      );
      // Requested-depth validation guarantees homogeneous arrays at every native group level.
      const converted: LoadResultObject<RecordType> = {
        data: result.data as LoadResultObject<RecordType>['data'],
      };
      if (totalCount !== undefined) converted.totalCount = totalCount;
      if (groupCount !== undefined) converted.groupCount = groupCount;
      if (summary !== undefined) converted.summary = summary;
      return converted;
    },
  });
}
