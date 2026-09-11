import type { RaRecord } from 'react-admin';
import type { DatagridDXDataProvider, GetGridParams, GetGridResult } from '../../../../src/index';
import { normalizeDateOnlyFilter } from '../../dateOnlyFilter';

type SuccessListener = () => void;
const successListeners = new Set<SuccessListener>();

export function onGridSuccess(listener: SuccessListener): () => void {
  successListeners.add(listener);
  return () => {
    successListeners.delete(listener);
  };
}

function notifyGridSuccess(): void {
  for (const listener of successListeners) {
    listener();
  }
}

const notImplemented = (): Promise<never> =>
  Promise.reject(new Error('Not implemented in this read-only remote example.'));

export const dataProvider: DatagridDXDataProvider = {
  getList: notImplemented,
  getOne: notImplemented,
  getMany: notImplemented,
  getManyReference: notImplemented,
  update: notImplemented,
  updateMany: notImplemented,
  create: notImplemented,
  delete: notImplemented,
  deleteMany: notImplemented,

  async getGrid<RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetGridParams
  ): Promise<GetGridResult<RecordType>> {
    if (resource !== 'remote-customers' && resource !== 'grouped-remote-customers') {
      throw new Error(`Unsupported resource: ${resource}`);
    }

    const apiUrl = import.meta.env.VITE_GRID_API_URL ?? 'http://127.0.0.1:8000';

    const normalizedFilter = normalizeDateOnlyFilter(
      params.loadOptions.filter as unknown[] | null | undefined
    );

    const payload = {
      loadOptions: {
        ...params.loadOptions,
        ...(normalizedFilter !== undefined ? { filter: normalizedFilter } : {}),
      },
    };

    const response = await fetch(`${apiUrl}/api/customers/grid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      try {
        const errorBody = await response.json();
        if (
          errorBody &&
          Array.isArray(errorBody.detail) &&
          errorBody.detail.length > 0 &&
          typeof errorBody.detail[0]?.msg === 'string'
        ) {
          errorMessage = errorBody.detail[0].msg;
        } else if (typeof errorBody.detail === 'string') {
          errorMessage = errorBody.detail;
        }
      } catch {
        // Fall back to default HTTP error string
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    notifyGridSuccess();

    return {
      data: result.data,
      totalCount: result.totalCount,
      ...(result.summary !== undefined ? { summary: result.summary } : {}),
      ...(result.groupCount !== undefined ? { groupCount: result.groupCount } : {}),
    };
  },
};
