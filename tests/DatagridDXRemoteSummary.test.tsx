import { Component, createRef, type PropsWithChildren } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminContext, testDataProvider } from 'react-admin';
import { Column, Summary, TotalItem, type DataGridRef } from 'devextreme-react/data-grid';
import { DatagridDXRemote, type DatagridDXRemoteProps, type GetGridParams } from '../src';

type Customer = { id: number; age: number };
const rows = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, age: i + 20 }));
const totalItems = [
  { column: 'id', summaryType: 'count', name: 'customers', displayFormat: 'Customers: {0}' },
  {
    column: 'age',
    summaryType: 'avg',
    name: 'average',
    valueFormat: { type: 'fixedPoint', precision: 1 },
  },
] as const;

class SummaryBoundary extends Component<PropsWithChildren, { error: Error | null }> {
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

function harness(initialProps: DatagridDXRemoteProps<Customer> = {}) {
  const getGrid = vi.fn(async (_resource: string, { loadOptions }: GetGridParams) => ({
    data: rows.slice(loadOptions.skip ?? 0, (loadOptions.skip ?? 0) + (loadOptions.take ?? 5)),
    ...(loadOptions.requireTotalCount ? { totalCount: rows.length } : {}),
    ...(loadOptions.totalSummary
      ? {
          summary: loadOptions.totalSummary.map((item) =>
            item.summaryType === 'count' ? 12 : 25.5
          ),
        }
      : {}),
  }));
  const provider = { ...testDataProvider(), getGrid };
  const ref = createRef<DataGridRef<Customer, number>>();
  const viewFor = (props: DatagridDXRemoteProps<Customer>) => (
    <AdminContext dataProvider={provider}>
      <SummaryBoundary>
        <DatagridDXRemote<Customer>
          resource="customers"
          paging={{ pageSize: 5 }}
          {...props}
          ref={ref}
        >
          <Column dataField="id" dataType="number" />
          <Column dataField="age" dataType="number" />
          {props.children}
        </DatagridDXRemote>
      </SummaryBoundary>
    </AdminContext>
  );
  const view = render(viewFor(initialProps));
  return {
    ...view,
    getGrid,
    ref,
    grid: () => ref.current!.instance(),
    rerender: (props: DatagridDXRemoteProps<Customer>) => view.rerender(viewFor(props)),
  };
}

async function loaded(grid: ReturnType<typeof harness>['grid']) {
  await waitFor(() => expect(grid().getDataSource().isLoaded()).toBe(true));
  await waitFor(() => expect(grid().getDataSource().isLoading()).toBe(false));
}

describe('remote native Summary configuration', () => {
  it.each(['props', 'children'])(
    'supports native %s with exact operation flags and display-only callbacks',
    async (mode) => {
      const onInitialized = vi.fn();
      const customizeText = vi.fn(({ valueText }: { valueText?: string }) => `Rows ${valueText}`);
      const { grid, getGrid, ref } = harness({
        onInitialized,
        ...(mode === 'props'
          ? { summary: { totalItems: totalItems.map((item) => ({ ...item, customizeText })) } }
          : {
              children: (
                <Summary>
                  <TotalItem {...totalItems[0]} customizeText={customizeText} />
                  <TotalItem {...totalItems[1]} />
                </Summary>
              ),
            }),
      });
      await loaded(grid);
      expect(ref.current).not.toBeNull();
      expect(onInitialized).toHaveBeenCalledTimes(1);
      expect(grid().option('remoteOperations')).toEqual({
        paging: true,
        sorting: true,
        filtering: true,
        summary: true,
        grouping: false,
        groupPaging: false,
      });
      expect(grid().option('groupPanel.visible')).toBe(false);
      expect(grid().option('headerFilter.visible')).toBe(false);
      expect(grid().getTotalSummaryValue('customers')).toBe(12);
      expect(grid().getTotalSummaryValue('average')).toBe(25.5);
      expect(customizeText).toHaveBeenCalled();
      expect(getGrid).toHaveBeenCalledWith('customers', {
        loadOptions: expect.objectContaining({
          totalSummary: [
            { selector: 'id', summaryType: 'count' },
            { selector: 'age', summaryType: 'avg' },
          ],
        }),
      });
    }
  );

  it.each([
    { calculateCustomSummary: () => undefined },
    { totalItems: [{ column: 'age', summaryType: 'custom' }] },
    { groupItems: [{ column: 'id', summaryType: 'count' }] },
    { skipEmptyValues: false },
    { totalItems: [{ column: 'age', summaryType: 'avg', skipEmptyValues: false }] },
    { totalItems: Array.from({ length: 33 }, () => ({ column: 'id', summaryType: 'count' })) },
  ])('rejects invalid native child settings before provider invocation %#', async (summary) => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { getGrid } = harness({ children: <Summary {...summary} /> });
      expect(await screen.findByRole('alert')).toHaveTextContent(/DatagridDXRemote/);
      expect(getGrid).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('rejects unsafe summary props at runtime as well as in native children', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { getGrid } = harness({
        summary: { calculateCustomSummary: () => undefined },
      } as unknown as DatagridDXRemoteProps<Customer>);
      expect(await screen.findByRole('alert')).toHaveTextContent(/DatagridDXRemote/);
      expect(getGrid).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('rejects callback-only option changes and guards a descriptor-free cached store load', async () => {
    const onOptionChanged = vi.fn();
    const { grid, getGrid } = harness({
      summary: { totalItems: totalItems.map((item) => ({ ...item })) },
      onOptionChanged,
    });
    await loaded(grid);
    const store = grid().getDataSource().store();
    getGrid.mockClear();
    act(() => {
      expect(() => grid().option('summary.calculateCustomSummary', () => undefined)).toThrow(
        /DatagridDXRemote/
      );
    });
    expect(getGrid).not.toHaveBeenCalled();
    await expect(Promise.resolve(store.load({ skip: 5, take: 5 }))).rejects.toThrow(
      /DatagridDXRemote/
    );
    expect(getGrid).not.toHaveBeenCalled();
    act(() => grid().option('summary.calculateCustomSummary', null));
    await act(async () => {
      await store.load({ skip: 5, take: 5 });
    });
    expect(getGrid).toHaveBeenCalledTimes(1);
    expect(onOptionChanged).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'summary.calculateCustomSummary', value: null })
    );
  });

  it.each([
    ['summary.totalItems[0].summaryType', 'custom'],
    ['summary.groupItems', [{ column: 'id', summaryType: 'count' }]],
    ['summary.skipEmptyValues', false],
  ])('blocks later semantic changes at %s', async (path, value) => {
    const { grid, getGrid } = harness({
      summary: { totalItems: totalItems.map((item) => ({ ...item })) },
    });
    await loaded(grid);
    getGrid.mockClear();
    act(() => {
      expect(() => grid().option(path as string, value)).toThrow(/DatagridDXRemote/);
    });
    expect(getGrid).not.toHaveBeenCalled();
  });

  it('preserves store identity, cached totals, paging, consumer events and ref disposal on rerender', async () => {
    const onInitialized = vi.fn();
    const onOptionChanged = vi.fn();
    const onDisposing = vi.fn();
    const props = {
      summary: { totalItems: totalItems.map((item) => ({ ...item })) },
      onInitialized,
      onOptionChanged,
      onDisposing,
    };
    const { grid, getGrid, ref, rerender, unmount } = harness(props);
    await loaded(grid);
    const instance = grid();
    const store = instance.getDataSource().store();
    await act(async () => {
      await instance.pageSize(3);
      await instance.pageIndex(1);
    });
    await loaded(grid);
    const before = getGrid.mock.calls.length;
    rerender({ ...props, onOptionChanged: vi.fn(), showBorders: true });
    await loaded(grid);
    expect(grid()).toBe(instance);
    expect(instance.getDataSource().store()).toBe(store);
    expect(instance.pageSize()).toBe(3);
    expect(instance.pageIndex()).toBe(1);
    expect(instance.getTotalSummaryValue('customers')).toBe(12);
    expect(getGrid.mock.calls.length).toBe(before);
    expect(getGrid.mock.calls.at(-1)?.[1].loadOptions.totalSummary).toBeUndefined();
    expect(onInitialized).toHaveBeenCalledTimes(1);
    expect(onOptionChanged).toHaveBeenCalled();
    unmount();
    expect(ref.current).toBeNull();
    expect(onDisposing).toHaveBeenCalledTimes(1);
  });
});
