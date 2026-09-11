import { Component, createRef, type PropsWithChildren } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminContext, testDataProvider } from 'react-admin';
import { type DataGridRef } from 'devextreme-react/data-grid';
import type dxDataGrid from 'devextreme/ui/data_grid';
import { DatagridDXRemote, type DatagridDXRemoteProps, type GetGridParams } from '../src';

type Row = { id: number; country: string; company: string };
class Boundary extends Component<PropsWithChildren, { error: Error | null }> {
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
const columns = [
  { dataField: 'id', dataType: 'number' as const },
  { dataField: 'country', dataType: 'string' as const, groupIndex: 0, autoExpandGroup: false },
  { dataField: 'company', dataType: 'string' as const, groupIndex: 1, autoExpandGroup: false },
];
function mount(props: DatagridDXRemoteProps<Row> = {}) {
  const ref = createRef<DataGridRef<Row, number>>();
  const getGrid = vi.fn(async (_resource: string, { loadOptions }: GetGridParams) => ({
    data: loadOptions.group
      ? [
          {
            key: loadOptions.group[0]!.selector === 'country' ? 'UK' : 'Acme',
            items: null,
            count: 2,
          },
        ]
      : [
          { id: 1, country: 'UK', company: 'Acme' },
          { id: 2, country: 'UK', company: 'Acme' },
        ],
    ...(loadOptions.requireTotalCount ? { totalCount: 2 } : {}),
    ...(loadOptions.requireGroupCount ? { groupCount: 1 } : {}),
  }));
  const provider = { ...testDataProvider(), getGrid };
  const onDataErrorOccurred = vi.fn();
  const grouping = { autoExpandAll: false };
  const paging = { pageSize: 5 };
  const view = (options: DatagridDXRemoteProps<Row>) => (
    <AdminContext dataProvider={provider}>
      <Boundary>
        <DatagridDXRemote<Row>
          ref={ref}
          resource="customers"
          groupPaging
          grouping={grouping}
          columns={columns}
          paging={paging}
          onDataErrorOccurred={onDataErrorOccurred}
          {...options}
        />
      </Boundary>
    </AdminContext>
  );
  const rendered = render(view(props));
  // Native group paths are arrays despite the declarations' record-key generic.
  return {
    ...rendered,
    getGrid,
    onDataErrorOccurred,
    grid: () => ref.current!.instance() as unknown as dxDataGrid<Row, number | string[]>,
    rerender: (options: DatagridDXRemoteProps<Row>) => rendered.rerender(view(options)),
  };
}
async function ready(view: ReturnType<typeof mount>) {
  await waitFor(() => expect(view.getGrid).toHaveBeenCalled());
  await waitFor(() => expect(view.grid().getDataSource().isLoading()).toBe(false));
  expect(view.onDataErrorOccurred).not.toHaveBeenCalled();
}
describe('mounted remote group paging', () => {
  it('reads full native grouping/user filter context through parent and leaf expansion then ungroups', async () => {
    const view = mount({ filterValue: ['id', '>', 0] });
    await ready(view);
    const context = {
      group: [
        { selector: 'country', desc: false, isExpanded: false },
        { selector: 'company', desc: false, isExpanded: false },
      ],
      filter: ['id', '>', 0],
    };
    expect(JSON.parse(JSON.stringify(view.getGrid.mock.calls[0]![1].loadOptions))).toMatchObject({
      groupPagingContext: context,
      skip: 0,
      take: 5,
      requireGroupCount: true,
    });
    expect(
      view
        .grid()
        .getVisibleRows()
        .map((row) => row.rowType)
    ).toEqual(['group']);
    await act(async () => {
      await view.grid().expandRow(['UK']);
    });
    await ready(view);
    expect(
      view.getGrid.mock.calls.some(
        ([, { loadOptions }]) => loadOptions.group?.[0]?.selector === 'company'
      )
    ).toBe(true);
    await act(async () => {
      await view.grid().expandRow(['UK', 'Acme']);
    });
    await ready(view);
    expect(
      view
        .grid()
        .getVisibleRows()
        .filter((row) => row.rowType === 'data')
        .map((row) => row.key)
    ).toEqual([1, 2]);
    const leaf = view.getGrid.mock.calls.at(-1)![1].loadOptions;
    expect(leaf.group).toBeUndefined();
    expect(JSON.parse(JSON.stringify(leaf.groupPagingContext))).toEqual(context);
    await act(async () => {
      view.grid().clearGrouping();
    });
    await ready(view);
    expect(view.getGrid.mock.calls.at(-1)![1].loadOptions.groupPagingContext).toBeUndefined();
  });
  it('does not recreate the store on unrelated rerenders', async () => {
    const changed = vi.fn();
    const view = mount({ onOptionChanged: changed });
    await ready(view);
    changed.mockClear();
    const store = view.grid().getDataSource().store();
    view.rerender({ onOptionChanged: changed });
    await ready(view);
    expect(view.grid().getDataSource().store()).toBe(store);
    expect(view.getGrid).toHaveBeenCalledTimes(1);
  });
  it('recreates the store when the semantic capability changes', async () => {
    const flatColumns = [{ dataField: 'id', dataType: 'number' as const }];
    const view = mount({ columns: flatColumns });
    await ready(view);
    const store = view.grid().getDataSource().store();
    view.rerender({ columns: flatColumns, groupPaging: false, grouping: { autoExpandAll: true } });
    await ready(view);
    expect(view.grid().getDataSource().store()).not.toBe(store);
    expect(view.grid().option('remoteOperations.groupPaging')).toBe(false);
    expect(view.getGrid.mock.calls.at(-1)![1].loadOptions.groupPagingContext).toBeUndefined();
  });
  it.each([
    [{ grouping: { autoExpandAll: true } }, /autoExpandAll must be false/],
    [{ columns: [{ dataField: 'country', groupIndex: 0 }] }, /country.*autoExpandGroup=false/],
    [
      { columns: [{ dataField: 'company', groupIndex: 0, autoExpandGroup: true }] },
      /company.*autoExpandGroup=false/,
    ],
  ] as const)(
    'rejects incompatible configuration %# before provider access',
    async (props, message) => {
      const view = mount(props as DatagridDXRemoteProps<Row>);
      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(view.getGrid).not.toHaveBeenCalled();
    }
  );
  it('rejects imperative remoteOperations overrides', async () => {
    const view = mount();
    await ready(view);
    expect(() => view.grid().option('remoteOperations.groupPaging', false)).toThrow(
      /groupPaging=true/
    );
  });
  it('rejects a native expandAll state before provider access', async () => {
    const view = mount();
    await ready(view);
    view.getGrid.mockClear();
    await act(async () => {
      view.grid().expandAll(0);
    });
    await waitFor(() => expect(view.onDataErrorOccurred).toHaveBeenCalled());
    expect(view.getGrid).not.toHaveBeenCalled();
    expect(view.onDataErrorOccurred.mock.calls[0]![0].error.message).toMatch(/expandAll/);
  });
});
