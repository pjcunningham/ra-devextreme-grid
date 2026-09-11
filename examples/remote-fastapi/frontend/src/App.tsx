import React, { useCallback, useEffect, useState } from 'react';
import { Admin, Resource, defaultLightTheme, type RaRecord } from 'react-admin';
import { Column, Summary, TotalItem } from 'devextreme-react/data-grid';
import { DatagridDXRemote } from '../../../../src/index';
import { dataProvider, onGridSuccess } from './dataProvider';
import { GroupedRemoteCustomerList } from './GroupedRemoteCustomerList';
import { GroupPagedRemoteCustomerList } from './GroupPagedRemoteCustomerList';

export interface Customer extends RaRecord {
  id: number;
  name: string;
  company: string;
  city: string;
  country: string;
  active: boolean;
  age: number | null;
  joined_on: string;
}

const stringFilterOperations = [
  '=',
  '<>',
  'contains',
  'notcontains',
  'startswith',
  'endswith',
] as const;

const numericFilterOperations = ['=', '<>', '>', '>=', '<', '<=', 'between'] as const;

const booleanFilterOperations = ['=', '<>'] as const;

const dateFilterOperations = ['=', '<>', '>', '>=', '<', '<=', 'between'] as const;

export function RemoteCustomerList(): React.JSX.Element {
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
    <div style={{ padding: '16px' }}>
      <h1>Remote Customers</h1>
      {errorMessage && (
        <div
          role="alert"
          className="app-error-alert"
          style={{
            backgroundColor: '#fde8e8',
            color: '#9b1c1c',
            padding: '12px 16px',
            marginBottom: '16px',
            borderRadius: '4px',
            border: '1px solid #f8b4b4',
            fontWeight: 500,
          }}
        >
          {errorMessage}
        </div>
      )}
      <DatagridDXRemote<Customer>
        layoutPreferenceKey="example.customers.remote.layout"
        paging={{ pageSize: 10 }}
        cacheEnabled={false}
        loadPanel={{ enabled: true }}
        pager={{
          visible: true,
          allowedPageSizes: [5, 10, 25],
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
        columnChooser={{ enabled: true, mode: 'select' }}
        columnFixing={{ enabled: true }}
        columnHidingEnabled={true}
        onDataErrorOccurred={handleDataErrorOccurred}
      >
        <Column
          dataField="id"
          caption="ID"
          dataType="number"
          width={70}
          filterOperations={[...numericFilterOperations]}
          selectedFilterOperation="="
        />
        <Column
          dataField="name"
          caption="Name"
          dataType="string"
          filterOperations={[...stringFilterOperations]}
          selectedFilterOperation="contains"
        />
        <Column
          dataField="company"
          caption="Company"
          dataType="string"
          filterOperations={[...stringFilterOperations]}
          selectedFilterOperation="contains"
        />
        <Column
          dataField="city"
          caption="City"
          hidingPriority={0}
          dataType="string"
          filterOperations={[...stringFilterOperations]}
          selectedFilterOperation="contains"
        />
        <Column
          dataField="country"
          caption="Country"
          dataType="string"
          filterOperations={[...stringFilterOperations]}
          selectedFilterOperation="="
        />
        <Column
          dataField="active"
          caption="Active"
          dataType="boolean"
          filterOperations={[...booleanFilterOperations]}
          selectedFilterOperation="="
        />
        <Column
          dataField="age"
          caption="Age"
          dataType="number"
          filterOperations={[...numericFilterOperations]}
          selectedFilterOperation="="
        />
        <Column
          dataField="joined_on"
          caption="Joined On"
          dataType="date"
          filterOperations={[...dateFilterOperations]}
          selectedFilterOperation="="
        />
        <Summary>
          <TotalItem
            column="id"
            summaryType="count"
            showInColumn="name"
            displayFormat="Customers: {0}"
          />
          <TotalItem
            column="age"
            summaryType="avg"
            displayFormat="Average age: {0}"
            valueFormat={{ type: 'fixedPoint', precision: 2 }}
          />
          <TotalItem column="age" summaryType="min" displayFormat="Minimum age: {0}" />
          <TotalItem column="age" summaryType="max" displayFormat="Maximum age: {0}" />
        </Summary>
      </DatagridDXRemote>
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <Admin dataProvider={dataProvider} theme={defaultLightTheme}>
      <Resource
        name="remote-customers"
        list={RemoteCustomerList}
        options={{ label: 'Remote Customers' }}
      />
      <Resource
        name="grouped-remote-customers"
        list={GroupedRemoteCustomerList}
        options={{ label: 'Grouped Remote Customers' }}
      />
      <Resource
        name="group-paged-remote-customers"
        list={GroupPagedRemoteCustomerList}
        options={{ label: 'Group-Paged Remote Customers' }}
      />
    </Admin>
  );
}
