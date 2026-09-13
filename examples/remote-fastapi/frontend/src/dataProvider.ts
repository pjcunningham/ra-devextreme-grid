import type { RaRecord } from 'react-admin';
import type { DatagridDXDataProvider, GetGridParams, GetGridResult } from '../../../../src/index';
import { normalizeDateOnlyFilter } from '../../dateOnlyFilter';

type SuccessListener = () => void;
const successListeners = new Set<SuccessListener>();
type RequestListener = (loadOptions: GetGridParams['loadOptions']) => void;
const requestListeners = new Set<RequestListener>();
let latestRequest: GetGridParams['loadOptions'] | null = null;

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

export function onGridRequest(listener: RequestListener): () => void {
  requestListeners.add(listener);
  if (latestRequest) listener(latestRequest);
  return () => {
    requestListeners.delete(listener);
  };
}

function notifyGridRequest(loadOptions: GetGridParams['loadOptions']): void {
  latestRequest = loadOptions;
  for (const listener of requestListeners) {
    listener(loadOptions);
  }
}

const apiBase =
  import.meta.env.VITE_GRID_API_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api' : '/api');

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
    if (
      !['remote-customers', 'grouped-remote-customers', 'group-paged-remote-customers'].includes(
        resource
      )
    ) {
      throw new Error(`Unsupported resource: ${resource}`);
    }

    const normalizedFilter = normalizeDateOnlyFilter(
      params.loadOptions.filter as unknown[] | null | undefined
    );

    const payload = {
      loadOptions: {
        ...params.loadOptions,
        ...(normalizedFilter !== undefined ? { filter: normalizedFilter } : {}),
        ...(params.loadOptions.groupPagingContext
          ? {
              groupPagingContext: {
                ...params.loadOptions.groupPagingContext,
                filter:
                  normalizeDateOnlyFilter(params.loadOptions.groupPagingContext.filter) ?? null,
              },
            }
          : {}),
      },
    };

    notifyGridRequest(payload.loadOptions);

    const response = await fetch(`${apiBase}/customers/grid`, {
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
