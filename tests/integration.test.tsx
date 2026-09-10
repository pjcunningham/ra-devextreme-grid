import { describe, it, expect, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { AdminContext, ListBase, type DataProvider, type RaRecord } from 'react-admin';
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
      <AdminContext dataProvider={dataProvider}>
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
});
