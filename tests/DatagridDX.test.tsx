import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX } from '../src/index';

interface Customer {
  id: number;
  name: string;
  email: string;
}

describe('DatagridDX component', () => {
  it('renders without crashing with default props', () => {
    const { container } = render(<DatagridDX />);
    expect(container.querySelector('.dx-datagrid')).toBeInTheDocument();
  });

  it('renders static records passed via the data prop', async () => {
    const records: Customer[] = [
      { id: 1, name: 'Alice Smith', email: 'alice@example.com' },
      { id: 2, name: 'Bob Jones', email: 'bob@example.com' },
    ];

    render(
      <DatagridDX<Customer> data={records} keyExpr="id">
        <Column dataField="name" caption="Customer Name" />
        <Column dataField="email" caption="Email Address" />
      </DatagridDX>
    );

    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(await screen.findByText('Bob Jones')).toBeInTheDocument();
  });

  it('renders child Column components and their captions', async () => {
    const records: Customer[] = [{ id: 1, name: 'Charlie Brown', email: 'charlie@example.com' }];

    render(
      <DatagridDX<Customer> data={records} keyExpr="id">
        <Column dataField="name" caption="Full Name" />
        <Column dataField="email" caption="Contact Email" />
      </DatagridDX>
    );

    expect(await screen.findByText('Full Name')).toBeInTheDocument();
    expect(await screen.findByText('Contact Email')).toBeInTheDocument();
  });

  it('passes through native DevExtreme options such as showBorders', () => {
    const { container } = render(
      <DatagridDX
        data={[{ id: 10, title: 'Item 1' }]}
        keyExpr="id"
        showBorders={true}
        showRowLines={true}
      />
    );

    const grid = container.querySelector('.dx-datagrid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveClass('dx-datagrid-borders');
  });

  it('falls back to dataSource prop when data prop is not provided', async () => {
    const records = [{ id: 100, label: 'From dataSource' }];

    render(<DatagridDX dataSource={records} keyExpr="id" />);

    expect(await screen.findByText('From dataSource')).toBeInTheDocument();
  });
});
