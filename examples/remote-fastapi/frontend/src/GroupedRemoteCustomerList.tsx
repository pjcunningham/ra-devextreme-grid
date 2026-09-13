import React, { useCallback, useEffect, useState } from 'react';
import { Column, GroupItem, GroupPanel, Summary, TotalItem } from 'devextreme-react/data-grid';
import { DatagridDXRemote } from '../../../../src/index';
import type { Customer } from './App';
import { onGridSuccess } from './dataProvider';
import { DemoIntro } from './DemoIntro';

export function GroupedRemoteCustomerList(): React.JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return onGridSuccess(() => {
      setErrorMessage(null);
    });
  }, []);

  const handleDataErrorOccurred = useCallback((e: { error?: Error | unknown }) => {
    const message =
      e.error instanceof Error ? e.error.message : String(e.error ?? 'Unknown error occurred');
    setErrorMessage(message);
  }, []);

  return (
    <div className="demo-page">
      <DemoIntro />
      <h2 className="demo-page-title">Grouped Remote Customers</h2>
      {errorMessage && (
        <div role="alert" className="app-error-alert">
          {errorMessage}
        </div>
      )}
      <DatagridDXRemote<Customer>
        paging={{ pageSize: 25 }}
        grouping={{ autoExpandAll: true, contextMenuEnabled: true }}
        loadPanel={{ enabled: true }}
        pager={{
          visible: true,
          allowedPageSizes: [25, 50, 100],
          showInfo: true,
          showNavigationButtons: true,
          showPageSizeSelector: true,
        }}
        sorting={{ mode: 'multiple' }}
        filterRow={{ visible: true }}
        showBorders={true}
        showRowLines={true}
        allowColumnResizing={true}
        allowColumnReordering={true}
        columnAutoWidth={true}
        onDataErrorOccurred={handleDataErrorOccurred}
      >
        <GroupPanel visible={true} />
        <Column dataField="id" caption="ID" dataType="number" width={70} />
        <Column dataField="name" caption="Name" dataType="string" />
        <Column dataField="company" caption="Company" dataType="string" groupIndex={1} />
        <Column dataField="city" caption="City" dataType="string" />
        <Column dataField="country" caption="Country" dataType="string" groupIndex={0} />
        <Column
          dataField="active"
          caption="Active"
          dataType="boolean"
          filterOperations={['=', '<>']}
          selectedFilterOperation="="
        />
        <Column dataField="age" caption="Age" dataType="number" />
        <Column dataField="joined_on" caption="Joined On" dataType="date" />
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
            displayFormat="Total average age: {0}"
            valueFormat={{ type: 'fixedPoint', precision: 2 }}
          />
        </Summary>
      </DatagridDXRemote>
    </div>
  );
}
