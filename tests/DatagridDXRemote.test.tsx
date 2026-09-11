import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { Component, createRef, type PropsWithChildren } from 'react';
import {
  AdminContext,
  ResourceContextProvider,
  TestMemoryRouter,
  memoryStore,
  testDataProvider,
  type AuthProvider,
  type DataProvider,
  type RaRecord,
} from 'react-admin';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import { DatagridDXRemote, type DatagridDXRemoteProps } from '../src/index';
import type { GetGridParams, GetGridResult } from '../src/remote/types';

interface Customer extends RaRecord<string> {
  id: string;
  name: string;
}

const customers: Customer[] = Array.from({ length: 45 }, (_, index) => ({
  id: `customer-${index + 1}`,
  name: `Customer ${index + 1}`,
}));

function makeProvider(prefix = 'Customer') {
  const getGrid = vi.fn(async (_resource: string, { loadOptions }: GetGridParams) => {
    const { skip = 0, take = 20 } = loadOptions;
    return {
      data: customers.slice(skip, skip + take).map((record) => ({
        ...record,
        name: record.name.replace('Customer', prefix),
      })),
      totalCount: customers.length,
    };
  });
  const getList = vi.fn().mockResolvedValue({ data: [], total: 0 });
  return { ...testDataProvider(), getList, getGrid };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface HarnessProps {
  dataProvider: DataProvider;
  contextResource?: string;
  authProvider?: AuthProvider;
  gridProps?: DatagridDXRemoteProps<Customer>;
}

function mountRemote(initialProps: HarnessProps) {
  const ref = createRef<DataGridRef<Customer, string>>();
  const store = memoryStore();
  function Harness({
    dataProvider,
    contextResource = 'customers',
    authProvider,
    gridProps,
  }: HarnessProps) {
    return (
      <TestMemoryRouter initialEntries={['/customers']}>
        <AdminContext dataProvider={dataProvider} authProvider={authProvider} store={store}>
          <ResourceContextProvider value={contextResource}>
            <DatagridDXRemote<Customer> {...gridProps} ref={ref}>
              <Column dataField="id" />
              <Column dataField="name" />
            </DatagridDXRemote>
          </ResourceContextProvider>
        </AdminContext>
      </TestMemoryRouter>
    );
  }
  const view = render(<Harness {...initialProps} />);
  return {
    ref,
    grid: () => ref.current!.instance(),
    rerender: (props: HarnessProps) => view.rerender(<Harness {...props} />),
  };
}

async function flushGridUpdates() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}

class ResourceErrorBoundary extends Component<PropsWithChildren, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    return this.state.error ? (
      <div role="alert">{this.state.error.message}</div>
    ) : (
      this.props.children
    );
  }
}

describe('DatagridDXRemote with real React-Admin contexts', () => {
  it.each([undefined, '', '   '])('rejects a missing or empty resource (%s)', async (resource) => {
    const provider = makeProvider();
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(
        <TestMemoryRouter>
          <AdminContext dataProvider={provider} store={memoryStore()}>
            <ResourceErrorBoundary>
              <DatagridDXRemote<Customer> resource={resource} />
            </ResourceErrorBoundary>
          </AdminContext>
        </TestMemoryRouter>
      );
      expect(await screen.findByRole('alert')).toHaveTextContent(/DatagridDXRemote.*resource/i);
      expect(provider.getGrid).not.toHaveBeenCalled();
      expect(provider.getList).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('uses the resource context, processed rows and count, and native remote defaults', async () => {
    const provider = makeProvider();
    const { grid } = mountRemote({ dataProvider: provider });

    expect(await screen.findByText('Customer 1')).toBeInTheDocument();
    expect(screen.getByText('Customer 20')).toBeInTheDocument();
    expect(screen.queryByText('Customer 21')).not.toBeInTheDocument();
    expect(provider.getGrid).toHaveBeenCalledTimes(1);
    expect(provider.getGrid).toHaveBeenLastCalledWith('customers', {
      loadOptions: expect.objectContaining({ skip: 0, take: 20, requireTotalCount: true }),
    });
    expect(grid().getDataSource().items()).toEqual(customers.slice(0, 20));
    expect(grid().totalCount()).toBe(45);
    expect(grid().pageCount()).toBe(3);
    expect(grid().pageSize()).toBe(20);
    expect(grid().pageIndex()).toBe(0);
    expect(grid().option('paging.enabled')).toBe(true);
    expect(grid().option('sorting.mode')).toBe('multiple');
    expect(grid().option('selection.mode')).toBe('none');
    expect(grid().getDataSource().store().key()).toBe('id');
    expect(grid().getKeyByRowIndex(0)).toBe('customer-1');
    expect(provider.getList).not.toHaveBeenCalled();
  });

  it('lets an explicit resource override context and configures the initial page size', async () => {
    const provider = makeProvider();
    const { grid } = mountRemote({
      dataProvider: provider,
      contextResource: 'ignored',
      gridProps: { resource: 'contacts', paging: { pageSize: 5 } },
    });

    expect(await screen.findByText('Customer 5')).toBeInTheDocument();
    expect(screen.queryByText('Customer 6')).not.toBeInTheDocument();
    expect(provider.getGrid).toHaveBeenCalledTimes(1);
    expect(provider.getGrid).toHaveBeenLastCalledWith('contacts', {
      loadOptions: expect.objectContaining({ skip: 0, take: 5, requireTotalCount: true }),
    });
    expect(grid().pageSize()).toBe(5);
    expect(provider.getList).not.toHaveBeenCalled();
  });

  it('loads native page and page-size changes through public grid methods only', async () => {
    const provider = makeProvider();
    const { grid } = mountRemote({ dataProvider: provider });
    await screen.findByText('Customer 1');

    await act(async () => {
      await grid().pageIndex(1);
    });
    expect(await screen.findByText('Customer 21')).toBeInTheDocument();
    expect(screen.queryByText('Customer 1')).not.toBeInTheDocument();
    expect(provider.getGrid).toHaveBeenCalledTimes(2);
    expect(provider.getGrid).toHaveBeenLastCalledWith('customers', {
      loadOptions: expect.objectContaining({ skip: 20, take: 20 }),
    });

    const loading = vi.fn();
    grid().getDataSource().store().on('loading', loading);
    act(() => {
      grid().pageSize(30);
    });
    await waitFor(() => {
      expect(provider.getGrid).toHaveBeenCalledTimes(3);
      expect(grid().getDataSource().isLoading()).toBe(false);
    });
    const offset = grid().pageIndex() * 30;
    expect(loading).toHaveBeenCalledTimes(1);
    // Native caching can request only the remainder of the newly visible page.
    const { skip, take } = loading.mock.calls[0]![0];
    expect(provider.getGrid).toHaveBeenLastCalledWith('customers', {
      loadOptions: expect.objectContaining({ skip, take }),
    });
    expect(
      grid()
        .getVisibleRows()
        .filter((row) => row.rowType === 'data')
        .map((row) => row.data)
    ).toEqual(customers.slice(offset, offset + 30));
    expect(grid().pageSize()).toBe(30);
    expect(grid().pageCount()).toBe(2);
    expect(provider.getList).not.toHaveBeenCalled();
  });

  it('preserves the exact store and current page without loading on an unrelated settled rerender', async () => {
    const provider = makeProvider();
    const { grid, rerender } = mountRemote({ dataProvider: provider });
    await screen.findByText('Customer 1');
    await act(async () => {
      await grid().pageIndex(1);
    });
    await screen.findByText('Customer 21');
    await flushGridUpdates();
    const originalStore = grid().getDataSource().store();
    const loadCount = provider.getGrid.mock.calls.length;

    rerender({ dataProvider: provider, gridProps: { showBorders: true } });
    await flushGridUpdates();

    expect(grid().option('showBorders')).toBe(true);
    expect(grid().getDataSource().store()).toBe(originalStore);
    expect(grid().pageIndex()).toBe(1);
    expect(grid().getDataSource().items()).toEqual(customers.slice(20, 40));
    expect(screen.getByText('Customer 21')).toBeInTheDocument();
    expect(provider.getGrid).toHaveBeenCalledTimes(loadCount);
    expect(provider.getList).not.toHaveBeenCalled();
  });

  it.each(['context', 'override'] as const)(
    'replaces the store and loads the new resource when the %s resource changes',
    async (source) => {
      const provider = makeProvider();
      const initialProps: HarnessProps = {
        dataProvider: provider,
        contextResource: 'customers',
        gridProps: source === 'override' ? { resource: 'customers' } : undefined,
      };
      const { grid, rerender } = mountRemote(initialProps);
      await screen.findByText('Customer 1');
      await flushGridUpdates();
      const originalStore = grid().getDataSource().store();
      provider.getGrid.mockClear();

      rerender({
        ...initialProps,
        ...(source === 'context'
          ? { contextResource: 'contacts' }
          : { gridProps: { resource: 'contacts' } }),
      });
      await waitFor(() => {
        expect(provider.getGrid).toHaveBeenCalledWith('contacts', {
          loadOptions: expect.objectContaining({ skip: 0, take: 20, requireTotalCount: true }),
        });
        expect(grid().getDataSource().isLoading()).toBe(false);
      });
      await flushGridUpdates();
      expect(grid().getDataSource().store()).not.toBe(originalStore);
      expect(provider.getGrid).toHaveBeenCalledTimes(1);
      expect(grid().getDataSource().items()).toEqual(customers.slice(0, 20));
      expect(provider.getList).not.toHaveBeenCalled();
    }
  );

  it('replaces the store and uses the replacement data provider', async () => {
    const provider = makeProvider();
    const replacement = makeProvider('Replacement');
    const { grid, rerender } = mountRemote({ dataProvider: provider });
    await screen.findByText('Customer 1');
    await flushGridUpdates();
    const originalStore = grid().getDataSource().store();
    const originalLoadCount = provider.getGrid.mock.calls.length;

    rerender({ dataProvider: replacement });
    expect(await screen.findByText('Replacement 1')).toBeInTheDocument();
    await flushGridUpdates();

    expect(grid().getDataSource().store()).not.toBe(originalStore);
    expect(replacement.getGrid).toHaveBeenCalledTimes(1);
    expect(replacement.getGrid).toHaveBeenLastCalledWith('customers', {
      loadOptions: expect.objectContaining({ skip: 0, take: 20, requireTotalCount: true }),
    });
    expect(screen.queryByText('Customer 1')).not.toBeInTheDocument();
    expect(provider.getGrid).toHaveBeenCalledTimes(originalLoadCount);
    expect(provider.getList).not.toHaveBeenCalled();
    expect(replacement.getList).not.toHaveBeenCalled();
  });

  it('uses native DataSource loading state for initial and subsequent controlled requests', async () => {
    const initial = deferred<GetGridResult<Customer>>();
    const subsequent = deferred<GetGridResult<Customer>>();
    const provider = {
      ...makeProvider(),
      getGrid: vi.fn().mockReturnValueOnce(initial.promise).mockReturnValueOnce(subsequent.promise),
    };
    const { grid } = mountRemote({
      dataProvider: provider,
      gridProps: { loadPanel: { enabled: true, text: 'Fetching remote customers' } },
    });
    await waitFor(() => expect(provider.getGrid).toHaveBeenCalledTimes(1));
    const dataSource = grid().getDataSource();
    expect(dataSource.isLoading()).toBe(true);
    expect(grid().option('loadPanel.enabled')).toBe(true);
    expect(grid().option('loadPanel.text')).toBe('Fetching remote customers');

    await act(async () => {
      initial.resolve({ data: customers.slice(0, 20), totalCount: 45 });
    });
    expect(await screen.findByText('Customer 1')).toBeInTheDocument();
    expect(dataSource.isLoading()).toBe(false);

    act(() => {
      void grid().pageIndex(1);
    });
    await waitFor(() => expect(provider.getGrid).toHaveBeenCalledTimes(2));
    expect(grid().getDataSource()).toBe(dataSource);
    expect(dataSource.isLoading()).toBe(true);
    await act(async () => {
      subsequent.resolve({ data: customers.slice(20, 40), totalCount: 45 });
    });
    expect(await screen.findByText('Customer 21')).toBeInTheDocument();
    expect(dataSource.isLoading()).toBe(false);
    expect(provider.getGrid).toHaveBeenLastCalledWith('customers', {
      loadOptions: expect.objectContaining({ skip: 20, take: 20 }),
    });
    expect(provider.getList).not.toHaveBeenCalled();
  });

  it('reports a normal provider rejection through the native data-error callback and clears loading', async () => {
    const pending = deferred<GetGridResult<Customer>>();
    const provider = { ...makeProvider(), getGrid: vi.fn().mockReturnValue(pending.promise) };
    const onDataErrorOccurred = vi.fn();
    const { grid } = mountRemote({ dataProvider: provider, gridProps: { onDataErrorOccurred } });
    await waitFor(() => expect(provider.getGrid).toHaveBeenCalledTimes(1));
    expect(grid().getDataSource().isLoading()).toBe(true);
    const error = new Error('Remote service unavailable');

    await act(async () => {
      pending.reject(error);
    });
    await waitFor(() => expect(onDataErrorOccurred).toHaveBeenCalledTimes(1));
    expect(onDataErrorOccurred).toHaveBeenCalledWith(expect.objectContaining({ error }));
    expect(grid().getDataSource().isLoading()).toBe(false);
    expect(provider.getList).not.toHaveBeenCalled();
  });

  it('passes getGrid rejections through the real React-Admin auth checkError wrapper', async () => {
    const error = Object.assign(new Error('Access denied'), { status: 403 });
    const checkError = vi.fn().mockResolvedValue(undefined);
    const authProvider: AuthProvider = {
      login: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn().mockResolvedValue(undefined),
      checkAuth: vi.fn().mockResolvedValue(undefined),
      checkError,
      getPermissions: vi.fn().mockResolvedValue(undefined),
    };
    const provider = { ...makeProvider(), getGrid: vi.fn().mockRejectedValue(error) };
    const onDataErrorOccurred = vi.fn();
    const { grid } = mountRemote({
      dataProvider: provider,
      authProvider,
      gridProps: { onDataErrorOccurred },
    });

    await waitFor(() => expect(checkError).toHaveBeenCalledWith(error));
    expect(checkError).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onDataErrorOccurred).toHaveBeenCalledTimes(1));
    expect(onDataErrorOccurred).toHaveBeenCalledWith(expect.objectContaining({ error }));
    expect(grid().getDataSource().isLoading()).toBe(false);
    expect(provider.getList).not.toHaveBeenCalled();
  });

  it('reports a missing getGrid method without falling back to getList', async () => {
    const getList = vi.fn().mockResolvedValue({ data: [], total: 0 });
    const provider = testDataProvider({ getList });
    const onDataErrorOccurred = vi.fn();
    const { grid } = mountRemote({ dataProvider: provider, gridProps: { onDataErrorOccurred } });

    await waitFor(() => expect(onDataErrorOccurred).toHaveBeenCalledTimes(1));
    expect(onDataErrorOccurred.mock.calls[0]?.[0].error.message).toMatch(
      /DatagridDXRemote.*getGrid/
    );
    expect(grid().getDataSource().isLoading()).toBe(false);
    expect(getList).not.toHaveBeenCalled();
  });
});
