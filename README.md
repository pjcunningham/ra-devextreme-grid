# ra-devextreme-grid

> DevExpress DevExtreme React DataGrid integration for React-Admin.

[![CI](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml/badge.svg)](https://github.com/pjcunningham/ra-devextreme-grid/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Status: Early Development

`ra-devextreme-grid` is currently under active early development and is **not yet production-ready**. The repository has established Phase 0 (Repository Foundation & Toolchain). Future phases will introduce managed `ListContext` integration, paging, sorting, selection, and remote operations mode.

## Overview & Purpose

The goal of `ra-devextreme-grid` is to provide a first-class, reusable integration between [React-Admin](https://marmelab.com/react-admin/) and the [DevExpress DevExtreme React DataGrid](https://js.devexpress.com/React/Documentation/Guide/UI_Components/DataGrid/Getting_Started_with_DataGrid/).

React-Admin provides robust application-level capabilities including resource routing, authentication, authorization, notifications, and form/record contexts. DevExtreme DataGrid provides high-performance grid features such as complex grouping, multi-column sorting, advanced filtering, and server-side data processing. `ra-devextreme-grid` bridges both worlds cleanly.

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
- `devextreme`: `^24.0.0 || ^25.0.0 || ^26.0.0`
- `devextreme-react`: `^24.0.0 || ^25.0.0 || ^26.0.0`

## Minimal Example

Below is a minimal example demonstrating `DatagridDX` with static records:

```tsx
import React from 'react';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX } from 'ra-devextreme-grid';
import 'devextreme/dist/css/dx.light.css';

interface Customer {
  id: number;
  name: string;
  city: string;
}

const customers: Customer[] = [
  { id: 1, name: 'Alice Smith', city: 'New York' },
  { id: 2, name: 'Bob Jones', city: 'London' },
];

export function CustomerList() {
  return (
    <DatagridDX<Customer> data={customers} keyExpr="id" showBorders={true}>
      <Column dataField="id" caption="ID" width={80} />
      <Column dataField="name" caption="Name" />
      <Column dataField="city" caption="City" />
    </DatagridDX>
  );
}
```

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

# Run unit tests (Vitest + jsdom)
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

- **Phase 0 (Current)**: Repository Foundation, Vite library bundling, TypeScript declarations, peer externalization, Vitest testing suite, interactive demo, CI pipeline.
- **Phase 1**: Read-Only Managed Grid (`<List><DatagridDX /></List>`, React-Admin `ListContext` consumption).
- **Phase 2**: Managed Paging and Single/Multi-Column Sorting.
- **Phase 3**: Row Selection (`selectedIds`, `onSelect`) and Row Click Navigation.
- **Phase 4**: Managed Filtering and Grid UX (Filter Row, Header Filter, Column Chooser).
- **Phase 5**: Remote Mode Foundation (`DatagridDXRemote`, `CustomStore`, `dataProvider.getGrid()`).
- **Phase 6+**: Python Reference Backend (FastAPI, SQLModel, UV).

## License & Disclaimers

### Project License

This project is licensed under the [MIT License](./LICENSE).  
Copyright (c) 2026 Paul Cunningham.

### Independent Project Disclaimer

`ra-devextreme-grid` is an independent open-source software project. It is **not** an official product of Developer Express Inc. (DevExpress) and is **not** an official product of Marmelab or the React-Admin core team.

### DevExpress Licensing Notice

DevExtreme is a commercial UI component suite developed and licensed by Developer Express Inc. Users of `ra-devextreme-grid` are solely responsible for ensuring they possess an appropriate and valid license from Developer Express Inc. to use DevExtreme in their applications and development environments.
