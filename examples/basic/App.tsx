import React from 'react';
import { Admin, Resource, List, type DataProvider, type RaRecord } from 'react-admin';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX } from '../../src/index';

interface Customer extends RaRecord {
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

const dataProvider: DataProvider = {
  getList: async <RecordType extends RaRecord = RaRecord>() => ({
    data: sampleCustomers as unknown as RecordType[],
    total: sampleCustomers.length,
  }),
  getOne: async <RecordType extends RaRecord = RaRecord>(
    _resource: string,
    params: { id: string | number }
  ) => {
    const record = sampleCustomers.find((c) => c.id === Number(params.id));
    if (!record) {
      throw new Error('Not found');
    }
    return { data: record as unknown as RecordType };
  },
  getMany: async <RecordType extends RaRecord = RaRecord>(
    _resource: string,
    params: { ids: (string | number)[] }
  ) => {
    const records = sampleCustomers.filter((c) => params.ids.includes(c.id));
    return { data: records as unknown as RecordType[] };
  },
  getManyReference: async () => ({ data: [], total: 0 }),
  create: () => Promise.reject(new Error('Read-only in Phase 1')),
  update: () => Promise.reject(new Error('Read-only in Phase 1')),
  updateMany: () => Promise.reject(new Error('Read-only in Phase 1')),
  delete: () => Promise.reject(new Error('Read-only in Phase 1')),
  deleteMany: () => Promise.reject(new Error('Read-only in Phase 1')),
};

export const CustomerList = (): React.JSX.Element => (
  <List title="Customers">
    <DatagridDX<Customer> showBorders={true} showRowLines={true}>
      <Column dataField="id" caption="ID" width={70} />
      <Column dataField="name" caption="Customer Name" />
      <Column dataField="company" caption="Company" />
      <Column dataField="city" caption="City" />
      <Column dataField="country" caption="Country" />
    </DatagridDX>
  </List>
);

export function App(): React.JSX.Element {
  return (
    <Admin dataProvider={dataProvider}>
      <Resource name="customers" list={CustomerList} />
    </Admin>
  );
}
