import React from 'react';
import {
  Admin,
  Resource,
  List,
  Edit,
  Show,
  SimpleForm,
  SimpleShowLayout,
  TextInput,
  TextField,
  useListContext,
  defaultLightTheme,
  type DataProvider,
  type GetListParams,
  type RaRecord,
} from 'react-admin';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX, DatagridDXPagination, parseRaFilterKey } from '../../src/index';

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
  { id: 5, name: 'Eva Green', company: 'Umbrella Corp', city: 'Paris', country: 'France' },
  { id: 6, name: 'Frank Wright', company: 'Cyberdyne Systems', city: 'Chicago', country: 'USA' },
  { id: 7, name: 'Grace Hopper', company: 'Hooli', city: 'Boston', country: 'USA' },
  { id: 8, name: 'Henry Ford', company: 'Pied Piper', city: 'Detroit', country: 'USA' },
  { id: 9, name: 'Iris West', company: 'Wayne Enterprises', city: 'Central City', country: 'USA' },
  { id: 10, name: 'Jack Bauer', company: 'CTU Technologies', city: 'Los Angeles', country: 'USA' },
  { id: 11, name: 'Karen Page', company: 'Nelson & Murdock', city: 'New York', country: 'USA' },
  { id: 12, name: 'Leo Fitz', company: 'SHIELD Labs', city: 'London', country: 'UK' },
  { id: 13, name: 'Mia Wong', company: 'Soylent Corp', city: 'San Francisco', country: 'USA' },
  { id: 14, name: 'Noah Bennett', company: 'Primatech Paper', city: 'Austin', country: 'USA' },
  { id: 15, name: 'Olivia Dunham', company: 'Massive Dynamic', city: 'Boston', country: 'USA' },
  { id: 16, name: 'Peter Parker', company: 'Daily Bugle', city: 'New York', country: 'USA' },
  { id: 17, name: 'Quinn Fabray', company: 'McKinley Global', city: 'Lima', country: 'USA' },
  { id: 18, name: 'Riley Reid', company: 'Tyrell Corp', city: 'Seattle', country: 'USA' },
  { id: 19, name: 'Sarah Connor', company: 'Resistance Media', city: 'San Diego', country: 'USA' },
  { id: 20, name: 'Tony Stark', company: 'Stark Industries', city: 'Malibu', country: 'USA' },
  { id: 21, name: 'Ursula Buffay', company: "Riff's Cafe", city: 'New York', country: 'USA' },
  { id: 22, name: 'Victor Stone', company: 'STAR Labs', city: 'Detroit', country: 'USA' },
  { id: 23, name: 'Wanda Maximoff', company: 'Westview Arts', city: 'Sokovia', country: 'Sokovia' },
  {
    id: 24,
    name: 'Xavier Charles',
    company: 'X-Mansion Academy',
    city: 'Westchester',
    country: 'USA',
  },
  { id: 25, name: 'Yvonne Strahovski', company: 'Buy More Inc', city: 'Burbank', country: 'USA' },
  {
    id: 26,
    name: 'Zack Morris',
    company: 'Bayside High',
    city: 'Pacific Palisades',
    country: 'USA',
  },
  {
    id: 27,
    name: 'Arthur Dent',
    company: 'Megadodo Publications',
    city: 'Cottington',
    country: 'UK',
  },
  { id: 28, name: 'Bruce Wayne', company: 'Wayne Enterprises', city: 'Gotham', country: 'USA' },
  { id: 29, name: 'Clark Kent', company: 'Daily Planet', city: 'Metropolis', country: 'USA' },
  {
    id: 30,
    name: 'Diana Prince',
    company: 'Themyscira Antiques',
    city: 'Washington',
    country: 'USA',
  },
  {
    id: 31,
    name: 'Elliot Alderson',
    company: 'Allsafe Cybersecurity',
    city: 'New York',
    country: 'USA',
  },
  { id: 32, name: 'Fiona Gallagher', company: "Patsy's Pies", city: 'Chicago', country: 'USA' },
  {
    id: 33,
    name: 'Geralt Rivia',
    company: 'Wolf School Witcher',
    city: 'Kaer Morhen',
    country: 'Temeria',
  },
  { id: 34, name: 'Hal Jordan', company: 'Ferris Aircraft', city: 'Coast City', country: 'USA' },
  { id: 35, name: 'Ian Malcolm', company: 'InGen Bioscience', city: 'Austin', country: 'USA' },
];

const dataProvider: DataProvider = {
  getList: async <RecordType extends RaRecord = RaRecord>(
    _resource: string,
    params: GetListParams
  ) => {
    const { pagination, sort, filter = {} } = params;
    const page = pagination?.page ?? 1;
    const perPage = pagination?.perPage ?? 10;
    const field = (sort?.field ?? 'id') as keyof Customer;
    const order = sort?.order ?? 'ASC';

    // 1. Filter the entire dataset before sorting and pagination
    let filtered = [...sampleCustomers];

    // External search filter (q)
    if (filter.q) {
      const q = String(filter.q).toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.city.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q)
      );
    }

    // Process column-specific filters
    for (const [key, rawVal] of Object.entries(filter)) {
      if (key === 'q' || rawVal === undefined || rawVal === null || rawVal === '') continue;

      const { field: propName, suffix } = parseRaFilterKey(key);
      const val = typeof rawVal === 'string' ? rawVal.toLowerCase() : rawVal;

      filtered = filtered.filter((record) => {
        const itemVal = record[propName as keyof Customer];
        if (suffix === 'q') {
          return itemVal != null && String(itemVal).toLowerCase().includes(String(val));
        }
        if (suffix === 'eq' || !suffix) {
          if (typeof itemVal === 'string' && typeof val === 'string') {
            return itemVal.toLowerCase() === val;
          }
          return itemVal === val;
        }
        if (suffix === 'neq') {
          if (typeof itemVal === 'string' && typeof val === 'string') {
            return itemVal.toLowerCase() !== val;
          }
          return itemVal !== val;
        }
        if (suffix === 'gt') {
          return itemVal != null && Number(itemVal) > Number(val);
        }
        if (suffix === 'gte') {
          return itemVal != null && Number(itemVal) >= Number(val);
        }
        if (suffix === 'lt') {
          return itemVal != null && Number(itemVal) < Number(val);
        }
        if (suffix === 'lte') {
          return itemVal != null && Number(itemVal) <= Number(val);
        }
        return true;
      });
    }

    // 2. Sort the filtered dataset
    const sorted = filtered.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal === bVal) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : 1;
      return order === 'DESC' ? -cmp : cmp;
    });

    // 3. Compute total of the filtered dataset before slicing
    const total = sorted.length;

    // 4. Paginate
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const sliced = sorted.slice(start, end);

    return {
      data: sliced as unknown as RecordType[],
      total,
    };
  },
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
  create: () => Promise.reject(new Error('Read-only in Phase 3')),
  update: async <RecordType extends RaRecord = RaRecord>(
    _resource: string,
    params: { id: string | number; data: Partial<Customer>; previousData?: Customer }
  ) => {
    const index = sampleCustomers.findIndex((c) => c.id === Number(params.id));
    if (index === -1) {
      throw new Error('Not found');
    }
    sampleCustomers[index] = { ...sampleCustomers[index], ...params.data } as Customer;
    return { data: sampleCustomers[index] as unknown as RecordType };
  },
  updateMany: () => Promise.reject(new Error('Read-only in Phase 3')),
  delete: () => Promise.reject(new Error('Read-only in Phase 3')),
  deleteMany: () => Promise.reject(new Error('Read-only in Phase 3')),
};

const SelectedCount = (): React.JSX.Element => {
  const { selectedIds } = useListContext<Customer>();
  const count = selectedIds?.length ?? 0;

  return (
    <div
      style={{
        padding: '8px 12px',
        marginBottom: '8px',
        backgroundColor: '#f0f4f8',
        borderRadius: '4px',
        fontSize: '14px',
      }}
    >
      <strong>Selected records:</strong> {count}{' '}
      {count > 0 && <span>(IDs: {selectedIds.join(', ')})</span>}
    </div>
  );
};

export const CustomerEdit = (): React.JSX.Element => (
  <Edit title="Edit Customer">
    <SimpleForm>
      <TextInput source="name" />
      <TextInput source="company" />
      <TextInput source="city" />
      <TextInput source="country" />
    </SimpleForm>
  </Edit>
);

export const CustomerShow = (): React.JSX.Element => (
  <Show title="Customer Details">
    <SimpleShowLayout>
      <TextField source="id" />
      <TextField source="name" />
      <TextField source="company" />
      <TextField source="city" />
      <TextField source="country" />
    </SimpleShowLayout>
  </Show>
);

const customerFilters = [
  <TextInput key="q" label="Global Search" source="q" alwaysOn />,
  <TextInput key="country" label="External Country Filter" source="country" />,
];

export const CustomerList = (): React.JSX.Element => (
  <List
    title="Customers"
    perPage={10}
    sort={{ field: 'name', order: 'ASC' }}
    filters={customerFilters}
    pagination={
      <DatagridDXPagination
        allowedPageSizes={[5, 10, 25]}
        showInfo={true}
        showNavigationButtons={true}
        showPageSizeSelector={true}
      />
    }
  >
    <SelectedCount />
    <DatagridDX<Customer>
      filtering
      selection
      rowClick="edit"
      showBorders={true}
      showRowLines={true}
      allowColumnResizing={true}
      allowColumnReordering={true}
      columnAutoWidth={true}
      columnChooser={{
        enabled: true,
        mode: 'select',
        search: {
          enabled: true,
        },
      }}
      columnFixing={{
        enabled: true,
      }}
      columnHidingEnabled={true}
    >
      <Column
        dataField="id"
        caption="ID"
        width={70}
        dataType="number"
        allowHiding={false}
        fixed={true}
        fixedPosition="left"
        filterOperations={['=', '<>', '>', '>=', '<', '<=', 'between']}
        selectedFilterOperation="="
      />
      <Column
        dataField="name"
        caption="Customer Name"
        dataType="string"
        hidingPriority={3}
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
      <Column
        dataField="company"
        caption="Company"
        dataType="string"
        hidingPriority={1}
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
      <Column
        dataField="city"
        caption="City"
        dataType="string"
        hidingPriority={0}
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
      <Column
        dataField="country"
        caption="Country"
        dataType="string"
        hidingPriority={2}
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
    </DatagridDX>
  </List>
);

export function App(): React.JSX.Element {
  return (
    <Admin dataProvider={dataProvider} theme={defaultLightTheme}>
      <Resource name="customers" list={CustomerList} edit={CustomerEdit} show={CustomerShow} />
    </Admin>
  );
}
