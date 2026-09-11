import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import {
  AdminContext,
  ResourceContextProvider,
  TestMemoryRouter,
  memoryStore,
  testDataProvider,
  type RaRecord,
} from 'react-admin';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import type { LoadOptions } from 'devextreme/common/data';
import { DatagridDXRemote } from '../src/index';
import type { GetGridParams } from '../src/remote/types';

interface Customer extends RaRecord<string> {
  id: string;
  name: string;
  country: string;
}

const customers: Customer[] = Array.from({ length: 65 }, (_, index) => ({
  id: `customer-${index + 1}`,
  name: `Customer ${65 - index}`,
  country: index % 2 ? 'UK' : 'US',
}));

function mountRemote() {
  // Intentionally return a synthetic processed page, not a query evaluator:
  // unchanged order and nonmatching rows detect any second client-side shaping.
  const getGrid = vi.fn(async (_resource: string, { loadOptions }: GetGridParams) => {
    const { skip = 0, take = 20 } = loadOptions;
    return { data: customers.slice(skip, skip + take), totalCount: customers.length };
  });
  const getList = vi.fn().mockResolvedValue({ data: [], total: 0 });
  const provider = { ...testDataProvider(), getGrid, getList };
  const ref = createRef<DataGridRef<Customer, string>>();
  const onDataErrorOccurred = vi.fn();
  const store = memoryStore();
  function Harness({ showBorders = false }: { showBorders?: boolean }) {
    return (
      <TestMemoryRouter initialEntries={['/customers']}>
        <AdminContext dataProvider={provider} store={store}>
          <ResourceContextProvider value="customers">
            <DatagridDXRemote<Customer>
              ref={ref}
              paging={{ pageSize: 20 }}
              sorting={{ mode: 'multiple' }}
              filterRow={{ visible: true, applyFilter: 'auto' }}
              showBorders={showBorders}
              onDataErrorOccurred={onDataErrorOccurred}
            >
              <Column dataField="id" dataType="string" />
              <Column dataField="name" dataType="string" />
              <Column dataField="country" dataType="string" />
            </DatagridDXRemote>
          </ResourceContextProvider>
        </AdminContext>
      </TestMemoryRouter>
    );
  }
  const view = render(<Harness />);
  const grid = () => ref.current!.instance();
  const latest = () => getGrid.mock.calls.at(-1)![1].loadOptions;
  async function ready() {
    await screen.findByText('Customer 65');
    await waitFor(() => expect(grid().getDataSource().isLoading()).toBe(false));
    expect(getGrid.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(getList).not.toHaveBeenCalled();
  }
  async function change(update: () => void) {
    const calls = getGrid.mock.calls.length;
    act(update);
    await waitFor(() => {
      expect(getGrid.mock.calls.length).toBeGreaterThan(calls);
      expect(grid().getDataSource().isLoading()).toBe(false);
    });
    expect(getList).not.toHaveBeenCalled();
  }
  function expectPage(skip = 0) {
    expect(
      grid()
        .getVisibleRows()
        .filter((row) => row.rowType === 'data')
        .map((row) => row.data)
    ).toEqual(customers.slice(skip, skip + 20));
    expect(grid().totalCount()).toBe(65);
    expect(getList).not.toHaveBeenCalled();
  }
  function capture(label: string) {
    console.log(`remote request ${label}: ${JSON.stringify(getGrid.mock.calls.at(-1))}`);
  }
  return {
    grid,
    getGrid,
    getList,
    latest,
    ready,
    change,
    expectPage,
    capture,
    onDataErrorOccurred,
    rerender: () => view.rerender(<Harness showBorders />),
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
}

describe('DatagridDXRemote native query integration', () => {
  it('forwards native single-column sorting without sorting the processed page again', async () => {
    const harness = mountRemote();
    await harness.ready();
    await harness.change(() => {
      harness.grid().columnOption('name', { sortIndex: 0, sortOrder: 'asc' });
    });
    expect(harness.latest()).toMatchObject({
      skip: 0,
      take: 20,
      sort: [{ selector: 'name', desc: false }],
    });
    harness.expectPage();
    harness.capture('single sort');
  });

  it('preserves native multi-sort precedence rather than column declaration order', async () => {
    const harness = mountRemote();
    await harness.ready();
    await harness.change(() => {
      harness.grid().beginUpdate();
      harness.grid().columnOption('country', { sortOrder: 'desc', sortIndex: 0 });
      harness.grid().columnOption('name', { sortOrder: 'asc', sortIndex: 1 });
      harness.grid().endUpdate();
    });
    expect(harness.latest().sort).toEqual([
      { selector: 'country', desc: true },
      { selector: 'name', desc: false },
    ]);
    harness.expectPage();
    harness.capture('ordered multi-sort');
  });

  it('forwards a single Filter Row column expression without filtering the processed page again', async () => {
    const harness = mountRemote();
    await harness.ready();
    expect(harness.grid().option('filterRow.visible')).toBe(true);
    await harness.change(() => {
      harness.grid().columnOption('name', {
        filterValue: 'not-in-this-page',
        selectedFilterOperation: 'contains',
      });
    });
    // Filter Row arrays carry native metadata properties outside their expression items.
    expect(harness.latest().filter).toEqual(harness.grid().getCombinedFilter(true));
    expect(JSON.stringify(harness.latest().filter)).toBe(
      JSON.stringify(['name', 'contains', 'not-in-this-page'])
    );
    harness.expectPage();
    harness.capture('single filter');
  });

  it('forwards multiple Filter Row columns as a native conjunction', async () => {
    const harness = mountRemote();
    await harness.ready();
    await harness.change(() => {
      harness.grid().beginUpdate();
      harness
        .grid()
        .columnOption('name', { filterValue: 'Customer', selectedFilterOperation: 'startswith' });
      harness.grid().columnOption('country', { filterValue: 'UK', selectedFilterOperation: '=' });
      harness.grid().endUpdate();
    });
    expect(harness.latest().filter).toEqual(harness.grid().getCombinedFilter(true));
    expect(JSON.stringify(harness.latest().filter)).toBe(
      JSON.stringify([['name', 'startswith', 'Customer'], 'and', ['country', '=', 'UK']])
    );
    harness.expectPage();
    harness.capture('multiple filters');
  });

  it('preserves nested native OR and NOT expressions supplied through filter()', async () => {
    const harness = mountRemote();
    await harness.ready();
    const filter = [
      ['country', '=', 'UK'],
      'or',
      ['!', [['name', 'contains', 'blocked'], 'and', ['country', '=', 'US']]],
    ];
    await harness.change(() => {
      harness.grid().filter(filter);
    });
    expect(harness.latest().filter).toEqual(filter);
    harness.expectPage();
    harness.capture('nested OR/NOT');
  });

  it('combines native paging, ordered sorting, and Filter Row values in one request', async () => {
    const harness = mountRemote();
    await harness.ready();
    await harness.change(() => {
      void harness.grid().pageIndex(1);
    });
    expect(harness.latest()).toMatchObject({ skip: 20, take: 20 });
    harness.expectPage(20);
    harness.capture('paging');
    await harness.change(() => {
      harness.grid().beginUpdate();
      harness.grid().columnOption('country', { sortOrder: 'desc', sortIndex: 0 });
      harness.grid().columnOption('name', {
        sortOrder: 'asc',
        sortIndex: 1,
        filterValue: 'Customer',
        selectedFilterOperation: 'contains',
      });
      harness.grid().endUpdate();
    });
    await harness.change(() => {
      void harness.grid().pageIndex(2);
    });
    expect(harness.latest()).toMatchObject({
      skip: 40,
      take: 20,
      sort: [
        { selector: 'country', desc: true },
        { selector: 'name', desc: false },
      ],
    });
    expect(harness.latest().filter).toEqual(harness.grid().getCombinedFilter(true));
    expect(JSON.stringify(harness.latest().filter)).toBe(
      JSON.stringify(['name', 'contains', 'Customer'])
    );
    harness.expectPage(40);
    harness.capture('combined');
  });

  it('preserves active native state on an unrelated rerender with inline option objects', async () => {
    const harness = mountRemote();
    await harness.ready();
    await harness.change(() => {
      harness.grid().columnOption('name', {
        sortIndex: 0,
        sortOrder: 'desc',
        filterValue: 'Customer',
        selectedFilterOperation: 'contains',
      });
    });
    await harness.change(() => {
      void harness.grid().pageIndex(1);
    });
    await settle();
    const store = harness.grid().getDataSource().store();
    const calls = harness.getGrid.mock.calls.length;
    harness.rerender();
    await settle();
    expect(harness.grid().option('showBorders')).toBe(true);
    expect(harness.grid().getDataSource().store()).toBe(store);
    expect(harness.grid().pageIndex()).toBe(1);
    expect(harness.grid().columnOption('name', 'sortOrder')).toBe('desc');
    expect(harness.grid().columnOption('name', 'sortIndex')).toBe(0);
    expect(harness.grid().columnOption('name', 'filterValue')).toBe('Customer');
    expect(harness.grid().columnOption('name', 'selectedFilterOperation')).toBe('contains');
    expect(harness.grid().option('filterRow.visible')).toBe(true);
    harness.expectPage(20);
    expect(harness.getGrid).toHaveBeenCalledTimes(calls);
  });

  it.each<[string, LoadOptions<Customer>]>([
    ['group', { group: [{ selector: 'country', isExpanded: false }] }],
    ['groupSummary', { groupSummary: [{ selector: 'id', summaryType: 'count' }] }],
    ['totalSummary', { totalSummary: [{ selector: '', summaryType: 'count' }] }],
    ['requireGroupCount', { requireGroupCount: true }],
  ])(
    'rejects %s through the mounted grid store before calling the provider',
    async (field, options) => {
      const harness = mountRemote();
      await harness.ready();
      const calls = harness.getGrid.mock.calls.length;
      await act(async () => {
        await expect(
          Promise.resolve(harness.grid().getDataSource().store().load(options))
        ).rejects.toThrow(new RegExp(`DatagridDXRemote.*${field}`));
      });
      expect(harness.getGrid).toHaveBeenCalledTimes(calls);
      expect(harness.getList).not.toHaveBeenCalled();
    }
  );

  it('reports native column grouping as an error before sending an advanced request to the provider', async () => {
    const harness = mountRemote();
    await harness.ready();
    const calls = harness.getGrid.mock.calls.length;
    act(() => {
      harness.grid().beginUpdate();
      // Grouping is disabled by the wrapper; force an advanced native request via public options.
      harness.grid().option('remoteOperations.grouping', true);
      harness.grid().columnOption('country', 'groupIndex', 0);
      harness.grid().endUpdate();
    });
    await waitFor(() => expect(harness.onDataErrorOccurred).toHaveBeenCalled());
    expect(harness.onDataErrorOccurred.mock.calls.at(-1)![0].error.message).toMatch(
      /DatagridDXRemote.*group/
    );
    await waitFor(() => expect(harness.grid().getDataSource().isLoading()).toBe(false));
    expect(harness.getGrid).toHaveBeenCalledTimes(calls);
    expect(harness.getList).not.toHaveBeenCalled();
  });
});
