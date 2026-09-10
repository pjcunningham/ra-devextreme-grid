# ra-devextreme-grid

> DevExpress DevExtreme React DataGrid integration for React-Admin.

[![CI](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml/badge.svg)](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Status: Early Development (Phase 2 Implemented)

`ra-devextreme-grid` is currently under active early development and is **not yet production-ready**.

The repository has implemented **Phase 2: Managed Paging and Single-Column Sorting**. In this phase:

- `DatagridDX` is a managed React-Admin grid component used inside `<List>`.
- `DatagridDXPagination` is an exported standalone pagination component backed by DevExtreme's `Pagination` widget.
- React-Admin owns all remote data fetching via `useListContext<RecordType>()`, along with page index, page size, total record count, and sort state.
- Interactive single-column server sorting is enabled with bidirectional synchronization and a feedback-loop guard.
- DataGrid internal paging remains disabled (`paging.enabled = false`) to guarantee that server-paged subsets are never locally re-paged by DevExtreme.
- Row identity is locked to canonical `record.id`.

## Overview & Purpose

The goal of `ra-devextreme-grid` is to provide a first-class, reusable integration between [React-Admin](https://marmelab.com/react-admin/) and the [DevExpress DevExtreme React DataGrid](https://js.devexpress.com/React/Documentation/Guide/UI_Components/DataGrid/Getting_Started_with_DataGrid/).

React-Admin provides robust application-level capabilities including resource routing, authentication, authorization, notifications, and list/record controllers. DevExtreme DataGrid provides high-performance grid features such as complex grouping, multi-column sorting, advanced filtering, and server-side data processing. `ra-devextreme-grid` bridges both worlds cleanly.

## DevExtreme Theme & Styling

This library is **strictly theme-agnostic** and does not import or bundle any DevExtreme CSS files.

Consuming applications are responsible for selecting and importing their desired DevExtreme theme (e.g. `dx.light.css`, `dx.dark.css`, or a custom theme built with the DevExtreme ThemeBuilder) at the application root:

```tsx
// In your application root or entry point (e.g. main.tsx)
import 'devextreme/dist/css/dx.light.css';
```

## Installation

> **Note**: This package is in pre-release development (version `0.0.0`) and has not yet been published to npm.

When published or installed locally:

```bash
pnpm add ra-devextreme-grid
```

### Peer Dependencies

Ensure your project installs the required peer dependencies:

```bash
pnpm add react react-dom react-admin devextreme devextreme-react
```

Supported peer ranges:

- `react`: `^18.0.0 || ^19.0.0`
- `react-dom`: `^18.0.0 || ^19.0.0`
- `react-admin`: `^5.0.0`
- `devextreme`: `^26.1.0`
- `devextreme-react`: `^26.1.0`

## Usage Example

`DatagridDX` and `DatagridDXPagination` must be used within a React-Admin `<List>` (or any component providing a `ListContext`):

```tsx
import React from 'react';
import { Admin, Resource, List, type RaRecord } from 'react-admin';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX, DatagridDXPagination } from 'ra-devextreme-grid';
import 'devextreme/dist/css/dx.light.css';

interface Customer extends RaRecord {
  id: number;
  name: string;
  company: string;
  city: string;
  country: string;
}

export const CustomerList = () => (
  <List
    perPage={10}
    sort={{ field: 'name', order: 'ASC' }}
    pagination={
      <DatagridDXPagination
        allowedPageSizes={[5, 10, 25]}
        showInfo={true}
        showNavigationButtons={true}
        showPageSizeSelector={true}
      />
    }
  >
    <DatagridDX<Customer> showBorders={true} showRowLines={true}>
      <Column dataField="id" caption="ID" width={70} />
      <Column dataField="name" caption="Customer Name" />
      <Column dataField="company" caption="Company" />
      <Column dataField="city" caption="City" />
      <Column dataField="country" caption="Country" />
    </DatagridDX>
  </List>
);

export const App = () => (
  <Admin dataProvider={dataProvider}>
    <Resource name="customers" list={CustomerList} />
  </Admin>
);
```

### Key Architectural Contracts

1. **Single Data Fetch Owner**: React-Admin's list controller owns all data fetching via `dataProvider.getList()`. `DatagridDX` and `DatagridDXPagination` consume `ListContext` and never issue independent network queries.
2. **Standalone Pagination (`DatagridDXPagination`)**:
   - DevExtreme `DataGrid`'s internal paging is permanently disabled (`paging.enabled = false`).
   - Paging is rendered by the standalone `DatagridDXPagination` component placed in `<List pagination={<DatagridDXPagination />} />`.
   - Maps 1-based `page` → `pageIndex`, `perPage` → `pageSize`, and `total` → `itemCount`.
   - Changing page or page size dispatches React-Admin's `setPage` or `setPerPage` callbacks without redundant queries.
   - **Known Limitation**: `DatagridDXPagination` requires a known `total` record count. When `total === undefined` or `null` (e.g. partial pagination), `DatagridDXPagination` renders `null` to avoid displaying misleading page counts.
3. **Managed Single-Column Sorting**:
   - `DatagridDX` managed mode supports **one React-Admin sort field at a time** (`{ field, order }`).
   - Clicking an unsorted column sorts ascending; clicking an active sort column toggles ascending ↔ descending.
   - Columns map to server sorting through their string `dataField`. Columns without a valid string `dataField` or with `allowSorting={false}` are excluded from sorting.
   - Bidirectional synchronization updates visual indicators on external sort changes (e.g. URL navigation), and an internal feedback guard prevents circular updates.
   - Multi-column sorting is reserved for the future remote mode adapter (`DatagridDXRemote` in Phase 5).
4. **Canonical Row Identity**: In React-Admin, `record.id` is the invariant identifier. DevExtreme `keyExpr` is locked to `"id"` internally. Both string and numeric identifiers are supported.
5. **Loading States**: Initial pending state activates DevExtreme's native loading UI while suppressing premature "No data" messages. Background refetching preserves visible records without UI flicker.

## Development Commands

This repository uses **pnpm** exclusively.

```bash
# Install dependencies
pnpm install

# Run the interactive example dev server
pnpm dev

# Build the library bundle (dist/index.js and dist/index.d.ts)
pnpm build

# Build the example application
pnpm build:example

# Run unit and integration tests (Vitest + jsdom)
pnpm test

# Run TypeScript type check
pnpm typecheck

# Run ESLint
pnpm lint

# Check formatting with Prettier
pnpm format:check

# Format code with Prettier
pnpm format
```

## Implementation Roadmap

- **Phase 0 (Completed)**: Repository Foundation, Vite library bundling, TypeScript declarations, peer externalization, Vitest testing suite, interactive demo, CI pipeline.
- **Phase 1 (Completed)**: Read-Only Managed Grid (`<List><DatagridDX /></List>`, React-Admin `ListContext` consumption, `record.id` canonical keying, data-shaping safeguards).
- **Phase 2 (Completed)**: Managed Paging and Single-Column Server Sorting (`DatagridDXPagination`, bidirectional single-column server sorting, feedback-loop guard).
- **Phase 3 (Next)**: Row Selection (`selectedIds`, `onSelect`) and Row Click Navigation.
- **Phase 4**: Managed Filtering and Grid UX (Filter Row, Header Filter, Column Chooser).
- **Phase 5**: Remote Mode Foundation (`DatagridDXRemote`, `CustomStore`, `dataProvider.getGrid()`, multi-column remote sorting).
- **Phase 6+**: Python Reference Backend (FastAPI, SQLModel, UV).

## License & Disclaimers

### Project License

This project is licensed under the [MIT License](./LICENSE).  
Copyright (c) 2026 Paul Cunningham.

### Independent Project Disclaimer

`ra-devextreme-grid` is an independent open-source software project. It is **not** an official product of Developer Express Inc. (DevExpress) and is **not** an official product of Marmelab or the React-Admin core team.

### DevExpress Licensing Notice

DevExtreme is a commercial UI component suite developed and licensed by Developer Express Inc. Users of `ra-devextreme-grid` are solely responsible for ensuring they possess an appropriate and valid license from Developer Express Inc. to use DevExtreme in their applications and development environments.
