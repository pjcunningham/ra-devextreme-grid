import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import {
  AdminContext,
  ListBase,
  TestMemoryRouter,
  memoryStore,
  type DataProvider,
  type RaRecord,
} from 'react-admin';
import { Column, type DataGridRef } from 'devextreme-react/data-grid';
import type { PaginationRef } from 'devextreme-react/pagination';
import { DatagridDX, DatagridDXPagination } from '../src/index';

interface Customer extends RaRecord {
  id: number;
  name: string;
  company: string;
}

const mockCustomers: Customer[] = Array.from({ length: 30 }, (_, i) => ({
  id: i + 1,
  name: `Customer ${i + 1}`,
  company: `Company ${((i * 7) % 30) + 1}`,
}));

describe('Integration: AdminContext + ListBase + DatagridDX + DatagridDXPagination', () => {
  it('coordinates paging and single-column sorting with real React-Admin getList queries', async () => {
    const getListSpy = vi.fn().mockImplementation(async (_resource, params) => {
      const { page = 1, perPage = 10 } = params.pagination ?? {};
      const { field = 'id', order = 'ASC' } = params.sort ?? {};

      const sorted = [...mockCustomers].sort((a, b) => {
        const aVal = a[field as keyof Customer];
        const bVal = b[field as keyof Customer];
        if (aVal === bVal) return 0;
        const cmp = aVal < bVal ? -1 : 1;
        return order === 'DESC' ? -cmp : cmp;
      });

      const start = (page - 1) * perPage;
      const sliced = sorted.slice(start, start + perPage);

      return {
        data: sliced,
        total: mockCustomers.length,
      };
    });

    const dataProvider: DataProvider = {
      getList: getListSpy,
      getOne: vi.fn(),
      getMany: vi.fn(),
      getManyReference: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };

    const paginationRef = createRef<PaginationRef>();
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <TestMemoryRouter initialEntries={['/customers']}>
        <AdminContext dataProvider={dataProvider} store={memoryStore()}>
          <ListBase resource="customers" perPage={10} sort={{ field: 'id', order: 'ASC' }}>
            <div>
              <DatagridDX<Customer> ref={gridRef}>
                <Column dataField="id" caption="ID" />
                <Column dataField="name" caption="Name" />
                <Column dataField="company" caption="Company" />
              </DatagridDX>
              <DatagridDXPagination ref={paginationRef} />
            </div>
          </ListBase>
        </AdminContext>
      </TestMemoryRouter>
    );

    // 1. Initial getList invocation
    expect(await screen.findByText('Customer 1')).toBeInTheDocument();
    expect(getListSpy).toHaveBeenCalledTimes(1);
    expect(getListSpy).toHaveBeenLastCalledWith(
      'customers',
      expect.objectContaining({
        pagination: { page: 1, perPage: 10 },
        sort: { field: 'id', order: 'ASC' },
      })
    );

    // 2. User moves to page 2 via DevExtreme Pagination
    act(() => {
      paginationRef.current?.instance().option('pageIndex', 2);
    });

    await waitFor(() => {
      expect(getListSpy).toHaveBeenCalledTimes(2);
      expect(getListSpy).toHaveBeenLastCalledWith(
        'customers',
        expect.objectContaining({
          pagination: { page: 2, perPage: 10 },
          sort: { field: 'id', order: 'ASC' },
        })
      );
    });
    expect(await screen.findByText('Customer 11')).toBeInTheDocument();

    // 3. User sorts by 'company' column
    // React-Admin resets to page 1 automatically when sort changes
    act(() => {
      gridRef.current?.instance().columnOption(2, 'sortOrder', 'asc');
    });

    await waitFor(() => {
      expect(getListSpy).toHaveBeenCalledTimes(3);
      expect(getListSpy).toHaveBeenLastCalledWith(
        'customers',
        expect.objectContaining({
          pagination: { page: 1, perPage: 10 },
          sort: { field: 'company', order: 'ASC' },
        })
      );
    });
  });

  it('coordinates filtering from page 2, resetting page to 1 and preserving sort in dataProvider.getList', async () => {
    const getListSpy = vi.fn().mockImplementation(async (_resource, params) => {
      const { page = 1, perPage = 10 } = params.pagination ?? {};
      const { field = 'id', order = 'ASC' } = params.sort ?? {};
      const filter = params.filter ?? {};

      let filtered = [...mockCustomers];
      if (filter.company_q) {
        filtered = filtered.filter((c) =>
          c.company.toLowerCase().includes(String(filter.company_q).toLowerCase())
        );
      }

      const sorted = filtered.sort((a, b) => {
        const aVal = a[field as keyof Customer];
        const bVal = b[field as keyof Customer];
        if (aVal === bVal) return 0;
        const cmp = aVal < bVal ? -1 : 1;
        return order === 'DESC' ? -cmp : cmp;
      });

      const start = (page - 1) * perPage;
      const sliced = sorted.slice(start, start + perPage);

      return {
        data: sliced,
        total: filtered.length,
      };
    });

    const dataProvider: DataProvider = {
      getList: getListSpy,
      getOne: vi.fn(),
      getMany: vi.fn(),
      getManyReference: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };

    const paginationRef = createRef<PaginationRef>();
    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <TestMemoryRouter initialEntries={['/customers']}>
        <AdminContext dataProvider={dataProvider} store={memoryStore()}>
          <ListBase resource="customers" perPage={10} sort={{ field: 'name', order: 'ASC' }}>
            <div>
              <DatagridDX<Customer> ref={gridRef} filtering>
                <Column dataField="id" caption="ID" />
                <Column dataField="name" caption="Name" />
                <Column dataField="company" caption="Company" />
              </DatagridDX>
              <DatagridDXPagination ref={paginationRef} />
            </div>
          </ListBase>
        </AdminContext>
      </TestMemoryRouter>
    );

    // Initial getList
    expect(await screen.findByText('Customer 1')).toBeInTheDocument();
    expect(getListSpy).toHaveBeenCalledTimes(1);

    // 1. User navigates to page 2
    act(() => {
      paginationRef.current?.instance().option('pageIndex', 2);
    });

    await waitFor(() => {
      expect(getListSpy).toHaveBeenCalledTimes(2);
      expect(getListSpy).toHaveBeenLastCalledWith(
        'customers',
        expect.objectContaining({
          pagination: { page: 2, perPage: 10 },
          sort: { field: 'name', order: 'ASC' },
        })
      );
    });

    // 2. User filters by company contains "Company 1" while on page 2
    act(() => {
      gridRef.current?.instance().option('filterValue', ['company', 'contains', 'Company 1']);
    });

    // React-Admin automatically resets page to 1 when filters change
    await waitFor(() => {
      expect(getListSpy).toHaveBeenCalledTimes(3);
      expect(getListSpy).toHaveBeenLastCalledWith(
        'customers',
        expect.objectContaining({
          pagination: { page: 1, perPage: 10 },
          sort: { field: 'name', order: 'ASC' },
          filter: { company_q: 'Company 1' },
        })
      );
    });

    // Single fetch owner: getListSpy was called exactly 3 times across the 3 user actions
    // (initial load -> page change -> filter change). No extraneous DevExtreme queries were issued.
    expect(getListSpy).toHaveBeenCalledTimes(3);
  });

  it('client-filter investigation: verifies server-filtered records render faithfully when filter semantics match', async () => {
    const matchingRecords: Customer[] = [
      { id: 10, name: 'Alice', company: 'Acme International' },
      { id: 20, name: 'Alex', company: 'Acme Corporation' },
    ];

    const getListSpy = vi.fn().mockResolvedValue({
      data: matchingRecords,
      total: matchingRecords.length,
    });

    const dataProvider: DataProvider = {
      getList: getListSpy,
      getOne: vi.fn(),
      getMany: vi.fn(),
      getManyReference: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };

    const gridRef = createRef<DataGridRef<Customer, number>>();

    render(
      <TestMemoryRouter initialEntries={['/customers']}>
        <AdminContext dataProvider={dataProvider} store={memoryStore()}>
          <ListBase resource="customers" perPage={10} filterDefaultValues={{ company_q: 'Acme' }}>
            <div>
              <DatagridDX<Customer> ref={gridRef} filtering>
                <Column dataField="id" caption="ID" />
                <Column dataField="name" caption="Name" />
                <Column dataField="company" caption="Company" />
              </DatagridDX>
            </div>
          </ListBase>
        </AdminContext>
      </TestMemoryRouter>
    );

    // Both server-filtered records match DevExtreme contains "Acme" semantics and are visible
    expect(await screen.findByText('Acme International')).toBeInTheDocument();
    expect(await screen.findByText('Acme Corporation')).toBeInTheDocument();
  });
});
