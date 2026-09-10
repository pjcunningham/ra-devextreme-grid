# ra-devextreme-grid

> DevExpress DevExtreme React DataGrid integration for React-Admin.

[![CI](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml/badge.svg)](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Status: Early Development (Phase 4A Implemented)

`ra-devextreme-grid` is currently under active early development and is **not yet production-ready**.

The repository has implemented **Phase 4A: Managed React-Admin Filtering with DevExtreme Filter Row**. In this phase:

- `DatagridDX` provides native DevExtreme Filter Row UI with React-Admin `ListContext` (`filterValues` and `setFilters()`) as the sole authoritative filter state owner.
- Filtering is opt-in via `<DatagridDX filtering />` or `<DatagridDX filtering={options} />`, with presentation options configurable through `DatagridDXFilterRowOptions`.
- Default translation maps DevExtreme operators to React-Admin flat filter suffixes (`_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_q`, and range `between`).
- Suffix parsing uses end-anchored regular expressions to fully support field names containing underscores (e.g. `company_name_q`, `created_at_gte`).
- Plain React-Admin fields without suffixes map to equality when matching a valid grid column.
- Bidirectional synchronization with deep semantic equality checking (`isFilterValueEqual`) and sync locks prevents feedback render loops.
- External/unrelated React-Admin filters (such as global `q` or backend flags) are strictly preserved when grid filters are modified or cleared.
- Filter dispatches engage React-Admin v5 debouncing (`setFilters(..., ..., true)`), and React-Admin automatically resets pagination to page 1.
- Custom conversion callbacks (`getRaFilters` and `getDxFilterValue`) provide public escape hatches for non-standard backend query syntaxes.
- Coexistence with single-column server sorting, cross-page selection persistence, and row navigation is fully verified.

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
    <DatagridDX<Customer>
      filtering
      selection
      rowClick="edit"
      showBorders={true}
      showRowLines={true}
    >
      <Column
        dataField="id"
        caption="ID"
        width={70}
        dataType="number"
        filterOperations={['=', '<>', '>', '>=', '<', '<=', 'between']}
        selectedFilterOperation="="
      />
      <Column
        dataField="name"
        caption="Customer Name"
        dataType="string"
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
      <Column
        dataField="company"
        caption="Company"
        dataType="string"
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
      <Column
        dataField="city"
        caption="City"
        dataType="string"
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
      <Column
        dataField="country"
        caption="Country"
        dataType="string"
        filterOperations={['contains', '=', '<>']}
        selectedFilterOperation="contains"
      />
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
2. **Controlled Multi-Row Selection & Cross-Page Persistence**:
   - Selection is opt-in via `<DatagridDX selection />` or `<DatagridDX selection={options} />`. Existing grids remain unselected by default.
   - React-Admin's `selectedIds` in `ListContext` is the sole authoritative store of selected IDs. The adapter holds no duplicate state.
   - **Cross-Page Selection Preservation**: DevExtreme receives only current-page selected IDs as controlled `selectedRowKeys`. When user modifies selection on the visible page, the adapter merges visible changes with off-page selected IDs before calling `onSelect`.
   - **Page-Bound Select All**: DevExtreme's `selectAllMode` is locked to `"page"`. Clicking the header checkbox selects current-page rows only and preserves selections made on other pages.
   - **Feedback-Loop Protection**: Selection changes are compared as order-independent sets with strict type checking (distinguishing `'1'` from `1`) to eliminate recursive update cycles.
   - **Adapter-Owned Invariants**: The adapter owns `mode: 'multiple'`, `deferred: false`, and `selectAllMode: 'page'`. Safe presentational options (`showCheckBoxesMode`, `allowSelectAll`, `sensitivity`) can be customized via `DatagridDXSelectionOptions`.
   - Native `onSelectionChanged` handlers supplied by consumers are composed and executed after React-Admin selection updates.
3. **Managed React-Admin Filtering with DevExtreme Filter Row**:
   - **Opt-In Presentation**: Configured via `filtering` (boolean) or `filtering={options}` (`DatagridDXFilterRowOptions`, derived from DevExtreme `FilterRow` options without `visible`). When enabled, defaults are `visible: true`, `showOperationChooser: true`, and `applyFilter: 'auto'`.
   - **Authoritative State Owner**: React-Admin's `ListContext` (`filterValues` and `setFilters()`) is the sole authoritative store of list filters. DevExtreme's `filterValue` is a controlled projection.
   - **Default Translation Mapping**:
     - `=` → `field_eq` (supports equality with `null`)
     - `<>` → `field_neq`
     - `>` → `field_gt`
     - `>=` → `field_gte`
     - `<` → `field_lt`
     - `<=` → `field_lte`
     - `contains` → `field_q`
     - `between` (`[min, max]`) → `field_gte: min` and `field_lte: max`
     - Plain fields without suffixes (e.g. `{ country: 'UK' }`) map to equality `['country', '=', 'UK']` when `country` is a valid grid column.
   - **Underscore Field Support**: Suffix parsing uses end-anchored regular expressions (`/(.*)_(eq|neq|gt|gte|lt|lte|q)$/`) to guarantee correct resolution of column names containing underscores (e.g. `company_name_q`, `created_at_gte`).
   - **Preservation of Unrelated External Filters**: External React-Admin filters not tied to grid columns (e.g. global `q` or backend flags) are strictly preserved when grid filters are added, modified, or cleared.
   - **Bidirectional Synchronization & Feedback Guard**: Programmatic sync uses deep semantic equality (`isFilterValueEqual`) and synchronization lock refs (`isFilteringSyncingRef`) to eliminate recursive render cycles.
   - **Debounced Updates & Automatic Paging Reset**: Filter Row updates call `setFilters(nextFilters, displayedFilters, true)` to engage React-Admin v5 debouncing. React-Admin automatically resets pagination to page 1; the adapter does not call `setPage(1)`.
   - **Client-Side Filter Reapplication Invariant**: When DevExtreme receives an array `dataSource`, it locally evaluates filter expressions against the array records. Therefore, backend server filtering semantics must correspond to the DevExtreme Filter Row operations configured on the column.
   - **Custom Converter Escape Hatches**: Consumers can provide custom `getRaFilters` and `getDxFilterValue` callbacks to map Filter Row expressions to non-standard backend query formats.
   - **Known Filtering Limitations**: Default managed filtering does not support arbitrary `OR` or `NOT` compound expressions (unsupported operations emit a development warning and omit the invalid condition safely). Header Filter is deferred because it requires the complete remote dataset. Search Panel and Filter Builder are not supported in managed mode.
4. **Declarative Row Navigation**:
   - Configured via `rowClick="edit"`, `rowClick="show"`, or `rowClick={false}` (default: `undefined`/`false`).
   - Uses React-Admin's public `useRedirect()` hook to navigate according to configured application routes.
   - Strictly restricted to data rows (`rowType === 'data'`). Header, group, and Filter Row cells (`rowType === 'filter'`) never trigger navigation.
   - **Interaction Isolation**: Selection checkbox clicks toggle selection only and never trigger row navigation.
   - **Consumer Cancellation**: Native `onRowClick` executes first. Setting `e.handled = true` cancels adapter navigation.
5. **Standalone Pagination (`DatagridDXPagination`)**:
   - DevExtreme `DataGrid`'s internal paging is permanently disabled (`paging.enabled = false`).
   - Paging is rendered by the standalone `DatagridDXPagination` component placed in `<List pagination={<DatagridDXPagination />} />`.
   - Maps 1-based `page` → `pageIndex`, `perPage` → `pageSize`, and `total` → `itemCount`.
   - Changing page or page size dispatches React-Admin's `setPage` or `setPerPage` callbacks without redundant queries.
   - **Known Limitation**: `DatagridDXPagination` requires a known `total` record count. When `total === undefined` or `null` (e.g. partial pagination), `DatagridDXPagination` renders `null` to avoid displaying misleading page counts.
6. **Managed Single-Column Sorting**:
   - `DatagridDX` managed mode supports **one React-Admin sort field at a time** (`{ field, order }`).
   - Clicking an unsorted column sorts ascending; clicking an active sort column toggles ascending ↔ descending.
   - Columns map to server sorting through their string `dataField`. Columns without a valid string `dataField` or with `allowSorting={false}` are excluded from sorting.
   - Bidirectional synchronization updates visual indicators on external sort changes (e.g. URL navigation), and an internal feedback guard prevents circular updates.
   - Multi-column sorting is reserved for the future remote mode adapter (`DatagridDXRemote` in Phase 5).
7. **Canonical Row Identity**: In React-Admin, `record.id` is the invariant identifier. DevExtreme `keyExpr` is locked to `"id"` internally. Both string and numeric identifiers are supported.
8. **Loading States**: Initial pending state activates DevExtreme's native loading UI while suppressing premature "No data" messages. Background refetching preserves visible records without UI flicker.

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
- **Phase 3 (Completed)**: Row Selection (`selectedIds`, `onSelect`) and Row Click Navigation (`rowClick="edit" | "show" | false`).
- **Phase 4A (Completed)**: Managed React-Admin Filtering with DevExtreme Filter Row (`DatagridDX filtering`, translation layer, bidirectional synchronization, underscore parsing, external filter preservation).
- **Phase 4B (Next: Grid UX)**: Column Chooser, column resizing, column reordering, column pinning/fixing, and state persistence.
- **Phase 5**: Remote Mode Foundation (`DatagridDXRemote`, `CustomStore`, `dataProvider.getGrid()`, multi-column remote sorting, remote filtering).
- **Phase 6+**: Python Reference Backend (FastAPI, SQLModel, UV).

## License & Disclaimers

### Project License

This project is licensed under the [MIT License](./LICENSE).  
Copyright (c) 2026 Paul Cunningham.

### Independent Project Disclaimer

`ra-devextreme-grid` is an independent open-source software project. It is **not** an official product of Developer Express Inc. (DevExpress) and is **not** an official product of Marmelab or the React-Admin core team.

### DevExpress Licensing Notice

DevExtreme is a commercial UI component suite developed and licensed by Developer Express Inc. Users of `ra-devextreme-grid` are solely responsible for ensuring they possess an appropriate and valid license from Developer Express Inc. to use DevExtreme in their applications and development environments.
