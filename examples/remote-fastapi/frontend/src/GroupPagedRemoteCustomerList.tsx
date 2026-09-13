import React, { useCallback, useEffect, useState } from 'react';
import { Column, GroupItem, GroupPanel, Summary, TotalItem } from 'devextreme-react/data-grid';
import { DatagridDXRemote } from '../../../../src/index';
import type { Customer } from './App';
import { onGridSuccess } from './dataProvider';
import { DemoIntro } from './DemoIntro';

export function GroupPagedRemoteCustomerList(): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  useEffect(() => onGridSuccess(() => setErrorMessage(null)), []);
  const handleDataErrorOccurred = useCallback((event: { error?: Error | unknown }) => {
    setErrorMessage(event.error instanceof Error ? event.error.message : String(event.error));
  }, []);
  return (
    <div className="demo-page">
      <DemoIntro />
      <h2 className="demo-page-title">Group-Paged Remote Customers</h2>
      <p>Groups start collapsed. Expand a country, then a company to load records remotely.</p>
      {errorMessage && (
        <div role="alert" className="app-error-alert">
          {errorMessage}
        </div>
      )}
      <DatagridDXRemote<Customer>
        layoutPreferenceKey="example.customers.groupPaged.layout"
        columnChooser={{ enabled: true, mode: 'select' }}
        groupPaging
        grouping={{ autoExpandAll: false, contextMenuEnabled: true }}
        paging={{ pageSize: 3 }}
        pager={{
          visible: true,
          allowedPageSizes: [3, 5, 8],
          showInfo: true,
          showNavigationButtons: true,
          showPageSizeSelector: true,
        }}
        sorting={{ mode: 'multiple' }}
        filterRow={{ visible: true }}
        loadPanel={{ enabled: true }}
        showBorders
        showRowLines
        columnAutoWidth
        onDataErrorOccurred={handleDataErrorOccurred}
      >
        <GroupPanel visible />
        <Column dataField="id" caption="ID" dataType="number" width={70} autoExpandGroup={false} />
        <Column dataField="name" caption="Name" dataType="string" autoExpandGroup={false} />
        <Column
          dataField="company"
          caption="Company"
          dataType="string"
          groupIndex={1}
          autoExpandGroup={false}
        />
        <Column dataField="city" caption="City" dataType="string" autoExpandGroup={false} />
        <Column
          dataField="country"
          caption="Country"
          dataType="string"
          groupIndex={0}
          autoExpandGroup={false}
        />
        <Column
          dataField="active"
          caption="Active"
          dataType="boolean"
          autoExpandGroup={false}
          filterOperations={['=', '<>']}
          selectedFilterOperation="="
        />
        <Column dataField="age" caption="Age" dataType="number" autoExpandGroup={false} />
        <Column dataField="joined_on" caption="Joined On" dataType="date" autoExpandGroup={false} />
        <Summary>
          <GroupItem column="id" summaryType="count" displayFormat="Group customers: {0}" />
          <GroupItem
            column="age"
            summaryType="avg"
            displayFormat="Group average age: {0}"
            valueFormat={{ type: 'fixedPoint', precision: 2 }}
          />
          <TotalItem
            column="id"
            summaryType="count"
            showInColumn="name"
            displayFormat="Total customers: {0}"
          />
          <TotalItem
            column="age"
            summaryType="avg"
            showInColumn="city"
            displayFormat="Total average age: {0}"
            valueFormat={{ type: 'fixedPoint', precision: 2 }}
          />
        </Summary>
      </DatagridDXRemote>
    </div>
  );
}
