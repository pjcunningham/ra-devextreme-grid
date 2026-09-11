import { Component, createRef, type PropsWithChildren } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminContext, testDataProvider } from 'react-admin';
import {
  Column,
  Grouping,
  GroupItem,
  GroupPanel,
  HeaderFilter,
  Summary,
  TotalItem,
  type DataGridRef,
} from 'devextreme-react/data-grid';
import { DatagridDXRemote, type DatagridDXRemoteProps, type GetGridParams } from '../src';

type Customer = { id: number; country: string; company: string; age: number };
const rows: Customer[] = [
  { id: 1, country: 'UK', company: 'Acme', age: 20 },
  { id: 2, country: 'UK', company: 'Acme', age: 30 },
];

class GroupingBoundary extends Component<PropsWithChildren, { error: Error | null }> {
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

function harness(props: DatagridDXRemoteProps<Customer> = {}) {
  const getGrid = vi.fn(async (_resource: string, { loadOptions }: GetGridParams) => {
    const summary = loadOptions.groupSummary ? [2, 25] : undefined;
    const nested = { key: 'Acme', items: rows, ...(summary ? { summary } : {}) };
    return {
      data: loadOptions.group
        ? [
            {
              key: 'UK',
              items: loadOptions.group.length === 2 ? [nested] : rows,
              ...(summary ? { summary } : {}),
            },
          ]
        : rows,
      ...(loadOptions.requireTotalCount ? { totalCount: 2 } : {}),
      ...(loadOptions.totalSummary ? { summary: [2] } : {}),
    };
  });
  const provider = { ...testDataProvider(), getGrid };
  const ref = createRef<DataGridRef<Customer, number>>();
  const viewFor = (options: DatagridDXRemoteProps<Customer>) => (
    <AdminContext dataProvider={provider}>
      <GroupingBoundary>
        <DatagridDXRemote<Customer>
          resource="customers"
          paging={{ pageSize: 10 }}
          {...options}
          ref={ref}
        />
      </GroupingBoundary>
    </AdminContext>
  );
  const view = render(viewFor(props));
  return {
    ...view,
    getGrid,
    grid: () => ref.current!.instance(),
    rerender: (options: DatagridDXRemoteProps<Customer>) => view.rerender(viewFor(options)),
  };
}

async function loaded(grid: ReturnType<typeof harness>['grid']) {
  await waitFor(() => expect(grid().getDataSource().isLoaded()).toBe(true));
  await waitFor(() => expect(grid().getDataSource().isLoading()).toBe(false));
}

describe('remote native grouping configuration', () => {
  it.each(['props', 'children'])(
    'renders complete nested groups and summaries with %s',
    async (mode) => {
      const onInitialized = vi.fn();
      const onOptionChanged = vi.fn();
      const props: DatagridDXRemoteProps<Customer> = {
        onInitialized,
        onOptionChanged,
        ...(mode === 'props'
          ? {
              grouping: { contextMenuEnabled: true },
              groupPanel: { visible: true },
              columns: [
                { dataField: 'id' },
                { dataField: 'country', groupIndex: 0 },
                { dataField: 'company', groupIndex: 1 },
                { dataField: 'age' },
              ],
              summary: {
                groupItems: [
                  { column: 'id', summaryType: 'count', displayFormat: 'Customers: {0}' },
                  { column: 'age', summaryType: 'avg', displayFormat: 'Age: {0}' },
                ],
                totalItems: [{ column: 'id', summaryType: 'count', displayFormat: 'Total: {0}' }],
              },
            }
          : {
              children: (
                <>
                  <Grouping autoExpandAll contextMenuEnabled />
                  <GroupPanel visible />
                  <Column dataField="id" />
                  <Column dataField="country" groupIndex={0} />
                  <Column dataField="company" groupIndex={1} />
                  <Column dataField="age" />
                  <Summary>
                    <GroupItem column="id" summaryType="count" displayFormat="Customers: {0}" />
                    <GroupItem column="age" summaryType="avg" displayFormat="Age: {0}" />
                    <TotalItem column="id" summaryType="count" displayFormat="Total: {0}" />
                  </Summary>
                </>
              ),
            }),
      };
      const { grid, getGrid, container, rerender } = harness(props);
      await loaded(grid);
      expect(getGrid.mock.calls[0]?.[1].loadOptions).toEqual({
        group: [
          { selector: 'country', desc: false, isExpanded: true },
          { selector: 'company', desc: false, isExpanded: false },
        ],
        groupSummary: [
          { selector: 'id', summaryType: 'count' },
          { selector: 'age', summaryType: 'avg' },
        ],
        totalSummary: [{ selector: 'id', summaryType: 'count' }],
      });
      expect(grid().option('grouping.autoExpandAll')).toBe(true);
      expect(grid().option('grouping.contextMenuEnabled')).toBe(true);
      expect(grid().option('groupPanel.visible')).toBe(true);
      expect(
        grid()
          .getVisibleRows()
          .filter((row) => row.rowType === 'data')
          .map((row) => row.data.id)
      ).toEqual([1, 2]);
      expect(container.querySelectorAll('.dx-group-row')).toHaveLength(2);
      expect(container.textContent).toContain('Customers: 2');
      expect(container.textContent).toContain('Age: 25');
      expect(container.textContent).toContain('Total: 2');
      const store = grid().getDataSource().store();
      const calls = getGrid.mock.calls.length;
      await act(async () => {
        await grid().collapseRow(['UK'] as unknown as number);
      });
      expect(
        grid()
          .getVisibleRows()
          .filter((row) => row.rowType === 'data')
      ).toHaveLength(0);
      await act(async () => {
        await grid().expandRow(['UK'] as unknown as number);
      });
      expect(
        grid()
          .getVisibleRows()
          .filter((row) => row.rowType === 'data')
      ).toHaveLength(2);
      expect(getGrid).toHaveBeenCalledTimes(calls);
      act(() => grid().option('showRowLines', true));
      expect(onOptionChanged).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'showRowLines', value: true })
      );
      rerender({ ...props, showBorders: true });
      expect(grid().getDataSource().store()).toBe(store);
      expect(onInitialized).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['autoExpandAll', <Grouping autoExpandAll={false} />],
    ['autoExpandGroup', <Column dataField="country" groupIndex={0} autoExpandGroup={false} />],
    [
      'calculateGroupValue',
      <Column dataField="country" groupIndex={0} calculateGroupValue={() => 'UK'} />,
    ],
  ])('rejects unsupported nested %s before getGrid', async (_name, children) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { getGrid } = harness({ children });
      expect(await screen.findByRole('alert')).toHaveTextContent(/DatagridDXRemote/);
      expect(getGrid).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it('rejects bypassed autoExpandAll prop without silently overwriting it', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { getGrid } = harness({
        grouping: { autoExpandAll: false },
      } as unknown as DatagridDXRemoteProps<Customer>);
      expect(await screen.findByRole('alert')).toHaveTextContent(/autoExpandAll/);
      expect(getGrid).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });

  it('keeps nested Header Filter disabled rather than issuing distinct group requests', async () => {
    const { grid } = harness({
      children: (
        <>
          <Column dataField="id" />
          <HeaderFilter visible />
        </>
      ),
    });
    await loaded(grid);
    expect(grid().option('headerFilter.visible')).toBe(false);
  });

  it.each([
    ['grouping.autoExpandAll', false],
    ['columns[0].autoExpandGroup', false],
    ['columns[0].calculateGroupValue', () => 'UK'],
    ['sortByGroupSummaryInfo', [{ summaryItem: 0 }]],
    ['remoteOperations.groupPaging', true],
    ['headerFilter.visible', true],
  ])('guards imperative %s and subsequent descriptor-free loads', async (path, value) => {
    const { grid, getGrid } = harness({ columns: [{ dataField: 'country' }] });
    await loaded(grid);
    const store = grid().getDataSource().store();
    getGrid.mockClear();
    act(() => {
      expect(() => grid().option(path as string, value)).toThrow(/DatagridDXRemote/);
    });
    await expect(Promise.resolve(store.load({}))).rejects.toThrow(/DatagridDXRemote/);
    expect(getGrid).not.toHaveBeenCalled();
  });

  it('bounds grouped columns including native nested bands before the first load', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { getGrid } = harness({
        columns: [
          {
            caption: 'Band',
            columns: Array.from({ length: 5 }, (_, groupIndex) => ({
              dataField: `field${groupIndex}`,
              groupIndex,
            })),
          },
        ],
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(/4 group levels/);
      expect(getGrid).not.toHaveBeenCalled();
    } finally {
      errors.mockRestore();
    }
  });
});
