# Changelog

All notable changes to `ra-devextreme-grid` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - 2026-09-11

Initial public release candidate of `ra-devextreme-grid`, providing first-class integration between DevExpress DevExtreme React DataGrid and React-Admin.

### Added

- **Managed Mode (`DatagridDX`)**:
  - Full integration with React-Admin `ListContext` and `dataProvider.getList()`.
  - Canonical `record.id` keying with support for string and numeric identifiers.
  - Bidirectional single-column server sorting synchronization with React-Admin.
  - Dedicated `DatagridDXPagination` pager component driven by React-Admin pagination state.
  - Row selection (`selectedIds`, `onSelect`) and row navigation (`rowClick="edit" | "show" | false`).
  - Managed Filter Row with bidirectional translation between DevExtreme filter expressions and React-Admin query payloads (handling `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `between`, and `contains`).
  - Column management UX: Column Chooser, column resizing, column reordering, column fixing/pinning, and adaptive responsive column hiding.
- **Remote Mode (`DatagridDXRemote`)**:
  - Standalone top-level resource list component communicating directly via `dataProvider.getGrid()`.
  - DevExtreme `CustomStore` wrapper for server-side paging, multi-column sorting, and nested filter expressions.
  - Remote whole-dataset total summaries (`sum`, `avg`, `min`, `max`, `count`) rendered in native DataGrid footers.
  - Remote multi-level grouping with complete expanded hierarchy trees and group-level summary aggregates.
  - Remote group paging (`groupPaging={true}`) for lazy group loading and scalable SQL group queries.
- **Visual Column Layout Persistence**:
  - Opt-in persistence via `layoutPreferenceKey` backed by React-Admin's Store (`useStoreContext`).
  - Synchronizes column visibility, visual display order, explicit column widths, and column pinning across browser sessions.
  - Strict preservation of query state neutrality (never persists query or pagination state).
- **Public API & Packaging**:
  - Pure ESM distribution (`dist/index.js`) with zero runtime dependencies (`dependencies: {}`).
  - Complete, unpolluted TypeScript declarations (`dist/index.d.ts`).
  - Exported filter conversion utilities: `defaultGetRaFilters`, `defaultGetDxFilterValue`, `parseRaFilterKey`, `ParsedRaFilterKey`.

### Architecture

- Strict dual-component architecture separating React-Admin-governed lists (`DatagridDX`) from native remote operations (`DatagridDXRemote`).
- Full externalization of peer dependencies: `react`, `react-dom`, `react-admin`, `ra-core`, `devextreme`, and `devextreme-react`.
- Zero bundled CSS; applications import their preferred DevExtreme stylesheet at the application root.

### Examples

- **Basic Managed Example (`examples/basic`)**: Standalone client-side application demonstrating `DatagridDX`, `DatagridDXPagination`, column chooser, column resizing, and layout persistence without backend dependencies.
- **Full-Stack Remote Example (`examples/remote-fastapi`)**: Full-stack reference application featuring:
  - Python 3.13 backend managed with `uv`.
  - FastAPI and SQLModel with dynamic SQLAlchemy query synthesis.
  - Parameterized, type-safe DevExtreme filter AST compiler.
  - Windowed group paging, recursive group count calculation, and multi-column sorting tie-breakers.
  - Vite frontend demonstrating remote summaries, grouping, and group paging.

### Testing

- 999 Vitest unit and integration tests covering components, filter translation, remote store handlers, and layout persistence.
- 2,300 Pytest backend tests validating SQL query generation, filter operators, summaries, and group aggregation.
- 35 Playwright end-to-end browser tests verifying live UI interaction against the FastAPI backend.
- Automated isolated consumer package smoke verification (`pnpm test:package`) testing packed tarballs under React 19 and React 18.

### Known Limitations

- Managed mode is limited to single-column sorting due to React-Admin `ListContext` design.
- Remote mode does not yet integrate with React-Admin's cross-page selection or bulk action toolbars.
- Inline cell and row editing are not supported; record edits are handled via standard React-Admin Edit views.
- Storing remote query state (filter expressions, active grouping, sort descriptors) is deferred to Phase 9B.
- Consuming applications require an appropriate commercial license from Developer Express Inc. to use DevExtreme.
