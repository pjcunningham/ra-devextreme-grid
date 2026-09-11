import { createRef } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DataGrid, { type DataGridRef } from 'devextreme-react/data-grid';
import ArrayStore from 'devextreme/data/array_store';
import CustomStore from 'devextreme/data/custom_store';
import type { LoadOptions } from 'devextreme/common/data';

interface Row {
  id: number;
  country: string | null;
  company: string | null;
  amount: number;
  active: boolean;
}
interface Group {
  key: string | null;
  items: Array<Group | Row> | null;
  count?: number;
  summary?: number[];
}
const rows: Row[] = [
  ...Array.from({ length: 8 }, (_, i) => ({
    country: 'A',
    company: i < 5 ? 'X' : i < 7 ? 'Y' : 'x',
  })),
  ...Array.from({ length: 3 }, () => ({ country: 'B', company: 'Z' })),
  { country: 'C', company: 'Z' },
  { country: 'D', company: null },
  { country: null, company: null },
  { country: 'a', company: 'X' },
].map((row, i) => ({ ...row, id: i + 1, amount: (i + 1) * 10, active: i % 2 === 0 }));

const summaries = [
  { column: 'id', summaryType: 'count' as const },
  { column: 'amount', summaryType: 'sum' as const },
];

function mountPaged(
  nested: boolean,
  childCount = false,
  cacheEnabled = true,
  options: { filter?: unknown[]; pageSize?: number; summaries?: boolean } = {}
) {
  const ref = createRef<DataGridRef<Row, number | Array<string | null>>>();
  const requests: LoadOptions<Row>[] = [];
  const responses: unknown[] = [];
  const array = new ArrayStore<Row, number>({ key: 'id', data: rows });
  const errors = vi.fn();
  const contentReady = vi.fn();
  const store = new CustomStore<Row, number>({
    key: 'id',
    loadMode: 'processed',
    load: async (options) => {
      requests.push(JSON.parse(JSON.stringify(options)) as LoadOptions<Row>);
      const filtered = (await array.load({ filter: options.filter })) as Row[];
      const groups = Array.isArray(options.group) ? options.group : [];
      let data: Row[] | Group[];
      let groupCount: number | undefined;
      if (groups.length) {
        const tree = (await array.load({
          filter: options.filter,
          group: options.group,
        })) as unknown as Group[];
        groupCount = tree.length;
        const leaves = (item: Group): Row[] =>
          item.items!.flatMap((child) => ('id' in child ? [child] : leaves(child)));
        data = tree
          .slice(options.skip ?? 0, (options.skip ?? 0) + (options.take ?? tree.length))
          .map((item) => {
            const records = leaves(item);
            return {
              key: item.key,
              items: null,
              count:
                childCount &&
                nested &&
                groups[0] &&
                typeof groups[0] === 'object' &&
                groups[0].selector === 'country'
                  ? new Set(records.map((row) => row.company)).size
                  : records.length,
              ...(Array.isArray(options.groupSummary) && options.groupSummary.length
                ? { summary: [records.length, records.reduce((sum, row) => sum + row.amount, 0)] }
                : {}),
            };
          });
      } else {
        data = (await array.load(options)) as Row[];
      }
      const result = {
        data,
        ...(options.requireTotalCount ? { totalCount: filtered.length } : {}),
        ...(options.requireGroupCount ? { groupCount } : {}),
        ...(Array.isArray(options.totalSummary) && options.totalSummary.length
          ? { summary: [filtered.length, filtered.reduce((sum, row) => sum + row.amount, 0)] }
          : {}),
      };
      responses.push(JSON.parse(JSON.stringify(result)));
      return result;
    },
  });
  const { unmount } = render(
    <DataGrid<Row, number | Array<string | null>>
      ref={ref}
      dataSource={store}
      cacheEnabled={cacheEnabled}
      remoteOperations={{
        paging: true,
        sorting: true,
        filtering: true,
        grouping: true,
        summary: true,
        groupPaging: true,
      }}
      grouping={{ autoExpandAll: false }}
      defaultPaging={{ pageSize: options.pageSize ?? 3 }}
      filterValue={options.filter}
      columns={[
        { dataField: 'id', dataType: 'number' },
        { dataField: 'country', dataType: 'string', groupIndex: 0, autoExpandGroup: false },
        {
          dataField: 'company',
          dataType: 'string',
          ...(nested ? { groupIndex: 1 } : {}),
          autoExpandGroup: false,
        },
        { dataField: 'amount', dataType: 'number' },
        { dataField: 'active', dataType: 'boolean' },
      ]}
      summary={options.summaries === false ? {} : { groupItems: summaries, totalItems: summaries }}
      onDataErrorOccurred={errors}
      onContentReady={contentReady}
    />
  );
  const grid = () => ref.current!.instance();
  const ready = async () => {
    await waitFor(() => {
      expect(contentReady).toHaveBeenCalled();
      expect(grid().getDataSource().isLoading()).toBe(false);
    });
    expect(errors).not.toHaveBeenCalled();
  };
  let cursor = 0;
  const evidence = (action: string) => {
    const state = {
      action,
      requests: requests.slice(cursor),
      responses: responses.slice(cursor),
      pageIndex: grid().pageIndex(),
      pageCount: grid().pageCount(),
      totalCount: grid().totalCount(),
      visible: grid()
        .getVisibleRows()
        .map((row) => ({ type: row.rowType, key: row.key, expanded: row.isExpanded })),
    };
    cursor = requests.length;
    expect({
      requests: state.requests.map((request) => JSON.stringify(request)),
      pageIndex: state.pageIndex,
      pageCount: state.pageCount,
      totalCount: state.totalCount,
      visible: state.visible,
    }).toMatchSnapshot(action);
    return state;
  };
  const change = async (action: string, callback: () => unknown) => {
    await act(async () => {
      await callback();
    });
    await ready();
    return evidence(action);
  };
  return { grid, requests, responses, ready, evidence, change, unmount };
}

describe('DevExtreme 26.1.4 public remote group paging protocol', () => {
  it('proves that native count-refresh load options cannot identify exact group scope alone', async () => {
    const single = mountPaged(false, false, true, { filter: ['company', '=', 'X'], pageSize: 5 });
    await single.ready();
    await single.change('collision one expand', () => single.grid().expandRow(['A']));
    const one = await single.change('collision one sort', () =>
      single.grid().columnOption('amount', 'sortOrder', 'desc')
    );
    const first = one.requests.find(
      (request) => request.requireGroupCount === false && request.requireTotalCount === true
    );
    single.unmount();
    const nested = mountPaged(true, false, true, { pageSize: 5 });
    await nested.ready();
    await nested.change('collision two expand', () => nested.grid().expandRow(['A']));
    await nested.change('collision two leaf', () => nested.grid().expandRow(['A', 'X']));
    const two = await nested.change('collision two sort', () =>
      nested.grid().columnOption('amount', 'sortOrder', 'desc')
    );
    const second = two.requests.find(
      (request) => request.requireGroupCount === false && request.requireTotalCount === true
    );
    expect(first).toEqual({
      skip: 0,
      take: 1,
      requireGroupCount: false,
      requireTotalCount: true,
      filter: [['country', '=', 'A'], 'and', ['company', '=', 'X']],
      group: null,
    });
    expect(second).toEqual(first);
    expect(
      rows.filter((row) => row.country === 'A' && row.company?.toLowerCase() === 'x')
    ).toHaveLength(6);
    expect(rows.filter((row) => row.country === 'A' && row.company === 'X')).toHaveLength(5);
  });
  it.each(['A', 'a'])(
    'records scope ambiguity with case-insensitive user filter %s',
    async (key) => {
      const view = mountPaged(true, false, true, {
        filter: ['country', '=', key],
        pageSize: 2,
        summaries: false,
      });
      await view.ready();
      view.evidence('ambiguity initial');
      await view.change('ambiguity expand', () => view.grid().expandRow([key === 'A' ? 'a' : 'A']));
      await view.change('ambiguity next page', () => view.grid().pageIndex(1));
    }
  );
  it.each([false, true])(
    'compares unequal parent count interpretation: childCount=%s',
    async (childCount) => {
      const view = mountPaged(true, childCount);
      await view.ready();
      view.evidence('count initial');
      await view.change('count expand A', () => view.grid().expandRow(['A']));
      await view.change('count expand X', () => view.grid().expandRow(['A', 'X']));
      await view.change('count page 2', () => view.grid().pageIndex(1));
      await view.change('count page 3', () => view.grid().pageIndex(2));
    }
  );
  it('loads NULL paths and uncached re-expansion', async () => {
    const view = mountPaged(true, false, false);
    await view.ready();
    await view.change('null parent', () => view.grid().expandRow([null]));
    await view.change('null child', () => view.grid().expandRow([null, null]));
    await view.change('null collapse', () => view.grid().collapseRow([null]));
    await view.change('null re-expand', () => view.grid().expandRow([null]));
  });
  it.each([false, true])('records native lifecycle with nested=%s', async (nested) => {
    const view = mountPaged(nested);
    await view.ready();
    view.evidence('initial');
    await view.change('next page', () => view.grid().pageIndex(1));
    await view.change('page size', () => view.grid().pageSize(5));
    await view.change('first page', () => view.grid().pageIndex(0));
    await view.change('expand A', () => view.grid().expandRow(['A']));
    await view.change('collapse A', () => view.grid().collapseRow(['A']));
    await view.change('re-expand A', () => view.grid().expandRow(['A']));
    if (nested) await view.change('expand A/X', () => view.grid().expandRow(['A', 'X']));
    await view.change('expanded next page', () => view.grid().pageIndex(1));
    await view.change('filter', () => view.grid().filter(['active', '=', true]));
    await view.change('filtered expand A', () => view.grid().expandRow(['A']));
    if (nested) await view.change('filtered expand A/X', () => view.grid().expandRow(['A', 'X']));
    await view.change('group descending', () =>
      view.grid().columnOption('country', 'sortOrder', 'desc')
    );
    await view.change('record descending', () =>
      view.grid().columnOption('amount', 'sortOrder', 'desc')
    );
    await view.change('ungroup', () => view.grid().clearGrouping());
    await view.change('regroup', () => view.grid().columnOption('country', 'groupIndex', 0));
    expect(view.requests.length).toBeGreaterThan(8);
  });
});
