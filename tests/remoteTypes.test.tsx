import { createRef } from 'react';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  Summary,
  TotalItem,
  type DataGridRef,
  type IDataGridOptions,
} from 'devextreme-react/data-grid';
import type { Summary as DxGridSummary, SummaryTotalItem } from 'devextreme/ui/data_grid';
import type { RaRecord } from 'react-admin';
import {
  DatagridDXRemote,
  type DatagridDXRemoteProps,
  type DatagridDXRemoteSummaryOptions,
  type DatagridDXDataProvider,
  type GetGridLoadOptions,
  type GetGridParams,
  type GetGridResult,
  type GetGridSortDescriptor,
  type GetGridSummaryDescriptor,
  type GetGridSummaryType,
  type GetGridSummaryValue,
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

  it('exports safe native summary props while preserving presentation and native children', () => {
    type Item = NonNullable<DatagridDXRemoteSummaryOptions['totalItems']>[number];
    expectTypeOf<DatagridDXRemoteProps<Customer>['summary']>().toEqualTypeOf<
      DatagridDXRemoteSummaryOptions | undefined
    >();
    expectTypeOf<DatagridDXRemoteProps<Customer>['children']>().toEqualTypeOf<
      IDataGridOptions<Customer, string>['children']
    >();
    expectTypeOf<DatagridDXRemoteSummaryOptions>().toExtend<DxGridSummary>();
    expectTypeOf<DatagridDXRemoteSummaryOptions['texts']>().toEqualTypeOf<DxGridSummary['texts']>();
    expectTypeOf<Item>().toExtend<SummaryTotalItem>();
    expectTypeOf<Item['summaryType']>().toEqualTypeOf<GetGridSummaryType>();
    expectTypeOf<Item['customizeText']>().toEqualTypeOf<SummaryTotalItem['customizeText']>();
    expectTypeOf<Item['valueFormat']>().toEqualTypeOf<SummaryTotalItem['valueFormat']>();
    expectTypeOf<Item['skipEmptyValues']>().toEqualTypeOf<true | undefined>();
    expectTypeOf<DatagridDXRemoteSummaryOptions['skipEmptyValues']>().toEqualTypeOf<
      true | undefined
    >();
    expectTypeOf<
      Extract<
        keyof DatagridDXRemoteSummaryOptions,
        'calculateCustomSummary' | 'groupItems' | 'recalculateWhileEditing'
      >
    >().toEqualTypeOf<never>();

    const summary: DatagridDXRemoteSummaryOptions = {
      skipEmptyValues: true,
      texts: { count: 'Rows: {0}' },
      totalItems: [
        { summaryType: 'count', showInColumn: 'name' },
        {
          summaryType: 'avg',
          column: 'Age column',
          skipEmptyValues: true,
          name: 'average',
          displayFormat: 'Average: {0}',
          showInColumn: 'name',
          cssClass: 'summary',
          alignment: 'right',
          customizeText: (info) => info.valueText,
          valueFormat: { type: 'fixedPoint', precision: 2 },
        },
        { summaryType: 'sum', column: 'age', valueFormat: (value: unknown) => String(value) },
        { summaryType: 'min', column: 'age' },
        { summaryType: 'max', column: 'age' },
      ],
    };
    const props = <DatagridDXRemote<Customer> summary={summary} />;
    const children = (
      <DatagridDXRemote<Customer>>
        <Summary skipEmptyValues>
          <TotalItem summaryType="count" showInColumn="name" />
          <TotalItem column="age" summaryType="avg" valueFormat="fixedPoint" />
        </Summary>
      </DatagridDXRemote>
    );
    expect([props, children]).toHaveLength(2);
  });

  it('rejects unsupported semantic summary props at compile time', () => {
    // @ts-expect-error Custom calculation is not executed by remote summaries.
    const callback = <DatagridDXRemote summary={{ calculateCustomSummary: () => undefined }} />;
    // @ts-expect-error Group summaries remain unsupported.
    const groups = <DatagridDXRemote summary={{ groupItems: [] }} />;
    // @ts-expect-error Editing recalculation configuration is not exposed.
    const editing = <DatagridDXRemote summary={{ recalculateWhileEditing: false }} />;
    // @ts-expect-error Empty-value semantics cannot be overridden.
    const empty = <DatagridDXRemote summary={{ skipEmptyValues: false }} />;
    const itemEmpty = (
      <DatagridDXRemote
        // @ts-expect-error Item empty-value semantics cannot be overridden.
        summary={{ totalItems: [{ summaryType: 'count', skipEmptyValues: false }] }}
      />
    );
    // @ts-expect-error Native's default summary type is not an explicit remote aggregate.
    const missingType = <DatagridDXRemote summary={{ totalItems: [{ column: 'age' }] }} />;
    // @ts-expect-error Custom summary types are not supported.
    const custom = <DatagridDXRemote summary={{ totalItems: [{ summaryType: 'custom' }] }} />;
    // @ts-expect-error Unknown summary types are not supported.
    const unknown = <DatagridDXRemote summary={{ totalItems: [{ summaryType: 'median' }] }} />;
    // @ts-expect-error Only count can omit the source column.
    const missingColumn = <DatagridDXRemote summary={{ totalItems: [{ summaryType: 'sum' }] }} />;
    const executableColumn = (
      // @ts-expect-error Executable columns are not supported.
      <DatagridDXRemote summary={{ totalItems: [{ summaryType: 'count', column: () => 'age' }] }} />
    );
    expect([
      callback,
      groups,
      editing,
      empty,
      itemEmpty,
      missingType,
      custom,
      unknown,
      missingColumn,
      executableColumn,
    ]).toHaveLength(10);
  });

  it('exports the exact narrow provider contract', () => {
    expectTypeOf<GetGridSortDescriptor>().toEqualTypeOf<{ selector: string; desc: boolean }>();
    expectTypeOf<GetGridLoadOptions>().toEqualTypeOf<{
      skip?: number;
      take?: number;
      requireTotalCount?: boolean;
      sort?: GetGridSortDescriptor[];
      filter?: unknown[] | null;
      totalSummary?: GetGridSummaryDescriptor[];
    }>();
    expectTypeOf<GetGridParams>().toEqualTypeOf<{ loadOptions: GetGridLoadOptions }>();
    expectTypeOf<GetGridResult<Customer>>().toEqualTypeOf<{
      data: Customer[];
      totalCount?: number;
      summary?: GetGridSummaryValue[];
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

  it('exports ordered built-in summary descriptors and JSON scalar results', () => {
    expectTypeOf<GetGridSummaryType>().toEqualTypeOf<'count' | 'sum' | 'avg' | 'min' | 'max'>();
    expectTypeOf<GetGridSummaryValue>().toEqualTypeOf<string | number | boolean | null>();
    const count: GetGridSummaryDescriptor = { summaryType: 'count' };
    const avg: GetGridSummaryDescriptor = { selector: 'age', summaryType: 'avg' };
    // @ts-expect-error Non-count summaries require a selector.
    const missing: GetGridSummaryDescriptor = { summaryType: 'sum' };
    // @ts-expect-error Custom summaries are not transportable.
    const custom: GetGridSummaryDescriptor = { selector: 'age', summaryType: 'custom' };
    // @ts-expect-error Executable selectors are not transportable.
    const executable: GetGridSummaryDescriptor = { selector: () => 1, summaryType: 'max' };
    expect([count, avg, missing, custom, executable]).toHaveLength(5);
  });
});
