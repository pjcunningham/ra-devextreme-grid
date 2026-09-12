# ra-devextreme-grid

> DevExtreme DataGrid integration for React-Admin, supporting both React-Admin-managed lists and native DevExtreme remote server operations.

[![CI](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml/badge.svg)](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/badge/version-0.1.0-blue.svg)](https://www.npmjs.com/package/ra-devextreme-grid)

---

## Release Status

**Version 0.1.0** is an early public release. The API is fully functional and backed by comprehensive unit, integration, backend, and end-to-end browser test suites. Because this is a pre-1.0 release, public APIs may still evolve based on developer feedback from real-world usage.

---

## Overview & Architecture

`ra-devextreme-grid` combines [React-Admin](https://marmelab.com/react-admin/)'s application architecture (resource management, authentication, routing, and controllers) with the rich UI capabilities of [DevExpress DevExtreme React DataGrid](https://js.devexpress.com/React/Documentation/Guide/UI_Components/DataGrid/Getting_Started_with_DataGrid/).

The library provides two distinct components with clear ownership boundaries:

```text
DatagridDX
  React-Admin ListController / dataProvider.getList()
  React-Admin owns pagination, sorting, filtering, selection, and record state.
  DevExtreme renders presentation, column resizing, reordering, and column chooser.

DatagridDXRemote
  DevExtreme CustomStore / dataProvider.getGrid()
  DevExtreme owns remote pagination, multi-column sorting, nested SQL filtering,
  grouping, group paging, and total/group summaries.
```

---

## Feature Comparison Matrix

| Feature                   |    Managed (`DatagridDX`)    | Remote (`DatagridDXRemote`) | Notes                                                                                |
| :------------------------ | :--------------------------: | :-------------------------: | :----------------------------------------------------------------------------------- |
| **Data Provider Method**  |         `getList()`          |         `getGrid()`         | Managed uses standard React-Admin data providers; remote requires `getGrid()`        |
| **Container Component**   |      Requires `<List>`       |  Standalone Resource list   | **Do not wrap `DatagridDXRemote` in `<List>`**                                       |
| **Paging**                |    `DatagridDXPagination`    |    Native DataGrid Pager    | Managed uses React-Admin pagination; remote uses DevExtreme `skip`/`take`            |
| **Single-Column Sort**    |             Yes              |             Yes             | Bidirectional synchronization in managed mode; native remote sorting in remote mode  |
| **Multi-Column Sort**     |              No              |             Yes             | Remote mode allows multi-column sorting expressions sent to the backend              |
| **Filter Row**            |          Translated          |           Native            | Managed translates Filter Row to React-Admin filter payload; remote sends native AST |
| **Grouping & Aggregates** |              No              |             Yes             | Remote mode supports expanded grouping and SQL group summaries                       |
| **Group Paging**          |              No              |             Yes             | Opt-in lazy remote grouping (`groupPaging={true}`) for scalable datasets             |
| **Total Summaries**       |              No              |             Yes             | Native footer summaries (sum, avg, min, max, count) calculated across dataset        |
| **Cross-Page Selection**  |             Yes              |           Not yet           | Managed mode uses React-Admin selection state; remote selection is deferred          |
| **Row Navigation**        | `rowClick="edit"` / `"show"` |      Native row events      | Managed mode triggers React-Admin route redirects                                    |
| **Visual Column Layout**  |             Yes              |             Yes             | Opt-in React-Admin Store persistence via `layoutPreferenceKey`                       |

---

## Installation

Install `ra-devextreme-grid` along with its peer dependencies:

```bash
# Using pnpm
pnpm add ra-devextreme-grid devextreme devextreme-react react-admin

# Using npm
npm install ra-devextreme-grid devextreme devextreme-react react-admin

# Using yarn
yarn add ra-devextreme-grid devextreme devextreme-react react-admin
```

### Peer Dependencies

The package has **zero runtime dependencies** (`dependencies: {}`) and relies on consumer-supplied peer dependencies:

| Peer Package       | Declared Supported Range | Tested Baseline       |
| :----------------- | :----------------------- | :-------------------- |
| `react`            | `^18.0.0 \|\| ^19.0.0`   | `19.0.0` and `18.3.1` |
| `react-dom`        | `^18.0.0 \|\| ^19.0.0`   | `19.0.0` and `18.3.1` |
| `react-admin`      | `^5.0.0`                 | `5.15.3`              |
| `devextreme`       | `^26.1.0`                | `26.1.4`              |
| `devextreme-react` | `^26.1.0`                | `26.1.4`              |

---

## DevExtreme Theme Setup

`ra-devextreme-grid` is **strictly theme-agnostic** and does not bundle or inject DevExtreme CSS. Import your preferred DevExtreme stylesheet at your application root (e.g., `main.tsx` or `App.tsx`):

```tsx
// Choose a predefined DevExtreme theme or a custom ThemeBuilder CSS file:
import 'devextreme/dist/css/dx.light.css';
// Or: import 'devextreme/dist/css/dx.dark.css';
// Or: import 'devextreme/dist/css/dx.material.blue.light.css';
```

---

## Quick Start: Managed Mode (`DatagridDX`)

Use `DatagridDX` inside React-Admin's standard `<List>` component. `ListController` manages query parameters, page state, sorting, and filtering:

```tsx
import { Admin, Resource, List, type RaRecord } from 'react-admin';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX, DatagridDXPagination } from 'ra-devextreme-grid';
import dataProvider from './dataProvider';
import 'devextreme/dist/css/dx.light.css';

interface Customer extends RaRecord {
  id: number;
  name: string;
  country: string;
  status: string;
  balance: number;
}

const CustomerList = () => (
  <List>
    <DatagridDX<Customer>
      rowClick="edit"
      filtering={{ applyFilter: 'auto' }}
      allowColumnResizing
      allowColumnReordering
      columnChooser={{ enabled: true, mode: 'select' }}
      layoutPreferenceKey="customers.list.layout"
    >
      <Column dataField="id" caption="ID" width={80} />
      <Column dataField="name" caption="Customer Name" />
      <Column dataField="country" caption="Country" />
      <Column dataField="status" caption="Status" />
      <Column dataField="balance" caption="Balance" dataType="number" format="currency" />
    </DatagridDX>
    <DatagridDXPagination />
  </List>
);

export const App = () => (
  <Admin dataProvider={dataProvider}>
    <Resource name="customers" list={CustomerList} />
  </Admin>
);
```

---

## Quick Start: Remote Mode (`DatagridDXRemote`)

Use `DatagridDXRemote` when your backend supports server-side operations (nested filtering, multi-column sorting, grouping, group paging, and total summaries).

> **Important**: Do **not** wrap `DatagridDXRemote` in `<List>` or `<ListBase>`. `DatagridDXRemote` acts as the top-level list component for the resource and communicates directly with your DataProvider's `getGrid()` method.

```tsx
import { Admin, Resource, type RaRecord } from 'react-admin';
import { Column } from 'devextreme-react/data-grid';
import {
  DatagridDXRemote,
  type DatagridDXDataProvider,
  type GetGridParams,
  type GetGridResult,
} from 'ra-devextreme-grid';
import 'devextreme/dist/css/dx.light.css';

interface Customer extends RaRecord {
  id: number;
  name: string;
  country: string;
  balance: number;
}

// 1. Extend your DataProvider with the getGrid method
const customDataProvider: DatagridDXDataProvider = {
  ...baseDataProvider,
  getGrid: async <RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetGridParams
  ): Promise<GetGridResult<RecordType>> => {
    const response = await fetch(`/api/${resource}/grid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.loadOptions),
    });
    return response.json();
  },
};

// 2. Define the Remote Grid Component
const RemoteCustomerList = () => (
  <DatagridDXRemote<Customer>
    paging={{ pageSize: 25 }}
    pager={{
      visible: true,
      allowedPageSizes: [10, 25, 50, 100],
      showPageSizeSelector: true,
      showInfo: true,
    }}
    sorting={{ mode: 'multiple' }}
    filterRow={{ visible: true }}
    grouping={{ contextMenuEnabled: true }}
    groupPaging={true}
    summary={{
      totalItems: [{ column: 'balance', summaryType: 'sum', valueFormat: 'currency' }],
    }}
    layoutPreferenceKey="remote.customers.layout"
  >
    <Column dataField="id" caption="ID" width={80} />
    <Column dataField="name" caption="Customer Name" />
    <Column dataField="country" caption="Country" groupIndex={0} />
    <Column dataField="balance" caption="Balance" dataType="number" />
  </DatagridDXRemote>
);

export const App = () => (
  <Admin dataProvider={customDataProvider}>
    <Resource name="customers" list={RemoteCustomerList} />
  </Admin>
);
```

---

## Visual Layout Persistence

Both `DatagridDX` and `DatagridDXRemote` support opt-in column layout persistence backed by React-Admin's Store (`useStoreContext`).

To enable persistence, provide an explicit `layoutPreferenceKey`:

```tsx
<DatagridDX layoutPreferenceKey="app.customers.grid_v1">...</DatagridDX>
```

### What is Persisted:

- **Column Visibility**: Which columns are visible or hidden via the Column Chooser.
- **Column Display Order**: User-reordered column positions (`visibleIndex`).
- **Explicit Column Widths**: Resized column widths (numbers, pixels, or percentages).
- **Column Pinning / Fixing**: Columns pinned to the left or right (`fixed`, `fixedPosition`).

### What is NOT Persisted:

- Query state (page number, page size, sort order, or active filters). Query state remains governed by React-Admin controllers or native DevExtreme DataSource state.
- Row selection or row expansion states.

To reset a saved layout programmatically, use React-Admin's `useRemoveFromStore`:

```tsx
import { useRemoveFromStore } from 'react-admin';

const ResetLayoutButton = () => {
  const remove = useRemoveFromStore();
  return <button onClick={() => remove('app.customers.grid_v1')}>Reset Columns</button>;
};
```

---

## Reference Backend: FastAPI & SQLModel

The repository includes a complete, production-ready reference backend implementation under [`examples/remote-fastapi/`](./examples/remote-fastapi/README.md).

It demonstrates:

- **SQLAlchemy & SQLModel** queries generated dynamically from DevExtreme load options.
- **Secure Filter Compiler**: Typed, parameter-safe translation of nested DevExtreme filter expressions (`=`, `<>`, `>`, `>=`, `<`, `<=`, `contains`, `startswith`, `endswith`, `notcontains`, `between`, `or`, `and`).
- **Deterministic Multi-Sort**: Primary sort criteria paired with unique primary key tie-breakers for stable pagination.
- **Group Paging & Group Summaries**: Recursive SQL aggregation and windowed group pagination without N+1 query overhead.
- **Browser E2E Integration**: Full Playwright test suite verifying real browser interaction with the live backend.

---

## Known Limitations

- **Managed Mode Single-Column Sort**: React-Admin's standard `ListContext` supports single-column sorting (`field` and `order`). Multi-column sorting requires `DatagridDXRemote`.
- **Managed Client-Side Pagination**: In managed mode, DevExtreme client pagination is disabled; pagination must be rendered via `DatagridDXPagination` communicating with React-Admin.
- **Remote React-Admin Selection Gap**: Remote mode does not yet integrate with React-Admin's `selectedIds` context; bulk action toolbars are not available in remote mode.
- **No Inline Grid Editing**: Neither managed nor remote grids currently support DevExtreme inline cell/row editing. Use React-Admin's standard Edit view via `rowClick="edit"`.
- **Query State Persistence Deferred**: Storing remote query state (filter expressions, grouping structure, sort descriptors) across sessions is planned for a future release (Phase 9B).
- **DevExtreme Commercial License**: DevExtreme is a commercial product. Consuming applications require an appropriate license from Developer Express Inc.

---

## License & Legal Notices

### Package License

`ra-devextreme-grid` is licensed under the [MIT License](./LICENSE).
Copyright (c) 2026 Paul Cunningham.

### Independent Project Disclaimer

`ra-devextreme-grid` is an independent open-source software project. It is **not** an official product of Developer Express Inc. (DevExpress) and is **not** an official product of Marmelab or the React-Admin core team.

### DevExpress Licensing Notice

DevExtreme is a commercial UI component suite developed and licensed by Developer Express Inc. Users of `ra-devextreme-grid` are solely responsible for ensuring they possess an appropriate and valid license from Developer Express Inc. to use DevExtreme in their applications and development environments.

## Support the project

If ra-devextreme-grid saves you development time, you can support its continued maintenance through [GitHub Sponsors](https://github.com/sponsors/pjcunningham).
