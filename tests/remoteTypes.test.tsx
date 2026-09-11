import { createRef } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DataGridRef, IDataGridOptions } from 'devextreme-react/data-grid';
import type { RaRecord } from 'react-admin';
import {
  DatagridDXRemote,
  type DatagridDXRemoteProps,
  type DatagridDXDataProvider,
  type GetGridLoadOptions,
  type GetGridParams,
  type GetGridResult,
  type GetGridSortDescriptor,
} from '../src/index';

interface Customer extends RaRecord<string> {
  id: string;
  name: string;
}

describe('remote public types', () => {
  it('preserves native record, key, ref, and event types', () => {
    const ref = createRef<DataGridRef<Customer, string>>();
    const element = (
      <DatagridDXRemote<Customer>
        ref={ref}
        resource="customers"
        paging={{ pageIndex: 0, pageSize: 10 }}
        pager={{
          visible: true,
          allowedPageSizes: [5, 10],
          showPageSizeSelector: true,
          showInfo: true,
        }}
        sorting={{ mode: 'multiple' }}
        filterRow={{ visible: true }}
        defaultFilterValue={['name', 'contains', 'smith']}
        onRowClick={(event) => {
          expectTypeOf(event.data).toEqualTypeOf<Customer>();
          expectTypeOf(event.key).toEqualTypeOf<string>();
        }}
        onDataErrorOccurred={(event) => {
          expectTypeOf(event.error).not.toBeAny();
        }}
        loadPanel={{ enabled: true }}
        allowColumnResizing
        allowColumnReordering
        columnFixing={{ enabled: true }}
        columnChooser={{ enabled: true }}
      />
    );
    expect(element).toBeDefined();
    expectTypeOf<DatagridDXRemoteProps<Customer>['onRowClick']>().toEqualTypeOf<
      IDataGridOptions<Customer, string>['onRowClick']
    >();
  });

  it('does not expose owned, mutation, selection, or deferred aliases', () => {
    type Forbidden =
      | 'dataSource'
      | 'keyExpr'
      | 'remoteOperations'
      | 'stateStoring'
      | 'defaultPaging'
      | 'grouping'
      | 'groupPanel'
      | 'defaultGroupPanel'
      | 'onGroupPanelChange'
      | 'summary'
      | 'headerFilter'
      | 'filterBuilder'
      | 'filterBuilderPopup'
      | 'filterPanel'
      | 'searchPanel'
      | 'editing'
      | 'defaultEditing'
      | 'onEditingChange'
      | 'onEditingStart'
      | 'onEditCanceling'
      | 'onEditCanceled'
      | 'onInitNewRow'
      | 'onRowInserting'
      | 'onRowInserted'
      | 'onRowUpdating'
      | 'onRowUpdated'
      | 'onRowRemoving'
      | 'onRowRemoved'
      | 'onRowValidating'
      | 'onSaving'
      | 'onSaved'
      | 'selection'
      | 'selectedRowKeys'
      | 'defaultSelectedRowKeys'
      | 'onSelectedRowKeysChange'
      | 'selectionFilter'
      | 'defaultSelectionFilter'
      | 'onSelectionFilterChange'
      | 'onSelectionChanged'
      | 'syncLookupFilterValues'
      | 'rowClick'
      | 'filtering'
      | 'getRaFilters'
      | 'getDxFilterValue';
    expectTypeOf<
      Extract<keyof DatagridDXRemoteProps<Customer>, Forbidden>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Extract<keyof NonNullable<DatagridDXRemoteProps<Customer>['paging']>, 'enabled'>
    >().toEqualTypeOf<never>();
    // @ts-expect-error The adapter owns the data source.
    const invalidSource = <DatagridDXRemote dataSource={[]} />;
    // @ts-expect-error Disabling native remote paging is not supported.
    const invalidPaging = <DatagridDXRemote paging={{ enabled: false }} />;
    // @ts-expect-error Consumer keyExpr is omitted; row identity is adapter-owned via CustomStore key.
    const invalidKeyExpr = <DatagridDXRemote keyExpr="id" />;
    const invalidRef = (
      // @ts-expect-error Record identifiers must match the forwarded ref.
      <DatagridDXRemote<Customer> ref={createRef<DataGridRef<Customer, number>>()} />
    );
    expect([invalidSource, invalidPaging, invalidKeyExpr, invalidRef]).toHaveLength(4);
  });

  it('exports the exact narrow provider contract', () => {
    expectTypeOf<GetGridSortDescriptor>().toEqualTypeOf<{ selector: string; desc: boolean }>();
    expectTypeOf<GetGridLoadOptions>().toEqualTypeOf<{
      skip?: number;
      take?: number;
      requireTotalCount?: boolean;
      sort?: GetGridSortDescriptor[];
      filter?: unknown[] | null;
    }>();
    expectTypeOf<GetGridParams>().toEqualTypeOf<{ loadOptions: GetGridLoadOptions }>();
    expectTypeOf<GetGridResult<Customer>>().toEqualTypeOf<{
      data: Customer[];
      totalCount?: number;
    }>();
    const check = (provider: DatagridDXDataProvider) => {
      expectTypeOf(provider.getGrid<Customer>).parameters.toEqualTypeOf<
        [resource: string, params: GetGridParams]
      >();
      expectTypeOf(provider.getGrid<Customer>).returns.toEqualTypeOf<
        Promise<GetGridResult<Customer>>
      >();
    };
    expectTypeOf(check).toBeFunction();
    // @ts-expect-error Remote selectors cannot be executable.
    const invalidSort: GetGridSortDescriptor = { selector: () => 1, desc: false };
    expect(invalidSort).toBeDefined();
  });
});
