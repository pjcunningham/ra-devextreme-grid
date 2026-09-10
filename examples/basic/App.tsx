import React from 'react';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX } from '../../src/index';

interface Customer {
  id: number;
  name: string;
  company: string;
  city: string;
  country: string;
}

const sampleCustomers: Customer[] = [
  { id: 1, name: 'Alice Smith', company: 'Acme Corp', city: 'New York', country: 'USA' },
  { id: 2, name: 'Bob Jones', company: 'Globex Ltd', city: 'London', country: 'UK' },
  {
    id: 3,
    name: 'Carol Danvers',
    company: 'Stark Industries',
    city: 'Los Angeles',
    country: 'USA',
  },
  { id: 4, name: 'David Miller', company: 'Initech', city: 'Berlin', country: 'Germany' },
];

export function App(): React.JSX.Element {
  return (
    <div style={{ padding: '24px', fontFamily: 'sans-serif' }}>
      <h1>ra-devextreme-grid — Proof-of-Concept</h1>
      <p>
        Minimal interactive demonstration showing <code>DatagridDX</code> with static data, custom
        columns, and application-level DevExtreme light theme.
      </p>
      <DatagridDX<Customer>
        data={sampleCustomers}
        keyExpr="id"
        showBorders={true}
        showRowLines={true}
      >
        <Column dataField="id" caption="ID" width={70} />
        <Column dataField="name" caption="Customer Name" />
        <Column dataField="company" caption="Company" />
        <Column dataField="city" caption="City" />
        <Column dataField="country" caption="Country" />
      </DatagridDX>
    </div>
  );
}
