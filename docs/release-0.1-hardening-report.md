# Release 0.1.0 Hardening & Publication Readiness Report

**Date**: 2026-09-11  
**Target Version**: `0.1.0`  
**Author**: Junie (Release Engineering Agent)  
**Repository**: `https://github.com/pjcunningham/ra-devextreme-grid`

---

## 1. Release Readiness Verdict

### **READY AFTER LISTED MANUAL STEPS**

**Justification**:

- All code, build, and packaging artifacts have been hardened and verified with zero release-blocking defects.
- The public API is frozen and encapsulated; TypeScript declarations are complete with zero leakage of internal implementation details.
- The npm release candidate tarball (`ra-devextreme-grid-0.1.0.tgz`) contains exactly 22 legitimate files (`dist/`, `package.json`, `README.md`, `LICENSE`), with 100% peer externalization and zero bundled CSS or proprietary assets.
- Dual compatibility with **React 19** and **React 18** has been verified in an isolated consumer project outside the repository via `pnpm test:package`.
- The full regression suite passed with zero errors: **999 Vitest tests**, **2,300 Pytest tests**, and **35 Playwright E2E browser tests**.
- Publication remains manual per release policy to allow final human developer review, npm 2FA authentication, and Git tagging.

---

## 2. Version Confirmation

The package version has been transitioned from `0.0.0` to:

```json
"version": "0.1.0"
```

All documentation references, example notes, and changelog headers have been updated to reflect `0.1.0`.

---

## 3. Npm Package-Name Availability

- **Registry Command**: `pnpm view ra-devextreme-grid`
- **Execution Timestamp**: 2026-09-11 22:19 UTC
- **Registry Response**: `HTTP 404 Not Found` (package is not registered or published on the public npm registry).
- **Status**: The unscoped package name `ra-devextreme-grid` appears **available** for publication.
- **Important Note**: Package name availability is not guaranteed by npm until the first publication command (`pnpm publish`) is executed.

---

## 4. Public API Inventory

The public API exported from `src/index.ts` is strictly frozen to the following symbols:

### Components

- `DatagridDX`: React-Admin managed list grid (requires `ListContext`).
- `DatagridDXPagination`: React-Admin managed pagination component.
- `DatagridDXRemote`: Standalone top-level remote list component (requires `getGrid()`).

### Filter Conversion Utilities

- `defaultGetRaFilters`: Translates DevExtreme filter expression to React-Admin filter object.
- `defaultGetDxFilterValue`: Translates React-Admin filter object to DevExtreme filter expression.
- `parseRaFilterKey`: Parses React-Admin filter key into field name and operator suffix.
- `ParsedRaFilterKey` (type): Interface for parsed field, operator, and suffix.

### Managed Props & Types

- `DatagridDXProps<RecordType>`
- `DatagridDXPaginationProps`
- `DatagridDXSelectionOptions`
- `DatagridDXRowClick`
- `DatagridDXFilterRowOptions`
- `DatagridDXFilterContext`
- `DatagridDXGetRaFilters`
- `DatagridDXGetDxFilterValue`

### Remote Props & Types

- `DatagridDXRemoteProps<RecordType>`
- `DatagridDXDataProvider`
- `GetGridParams`
- `GetGridLoadOptions`
- `GetGridResult<RecordType>`
- `GetGridSortDescriptor`
- `GetGridGroupDescriptor`
- `GetGridGroupPagingContext`
- `GetGridGroupKey`
- `GetGridGroupItem<RecordType>`
- `GetGridSummaryType`
- `GetGridSummaryDescriptor`
- `GetGridSummaryValue`
- `DatagridDXRemoteGroupingOptions`
- `DatagridDXRemoteSummaryOptions`
- `DatagridDXRemoteSummaryGroupItem`

### Strictly Encapsulated Internals (Not Exported)

- `createGridStore`, `normalizeLoadOptions`, `useGridLayoutPersistence`, `applyStoredLayout`, `StoredGridLayoutV1`, `isFilterValueEqual`, `isLayoutOptionPath`, `toDxSortOrder`, `toRaSortOrder`, `validateGridData`, `validateSummaryResult`, `validateSummaryOptions`.

---

## 5. Public API Changes During Hardening

- **Added**: `ParsedRaFilterKey` interface exported from `src/index.ts`. This companion type for `parseRaFilterKey()` was previously exported only from `src/filterUtils.ts`, ensuring consumer TypeScript type parity.
- **Enforced**: Added strict inventory assertion in `tests/index.test.ts` validating that `Object.keys(pkg).sort()` matches exactly the 6 runtime symbols and that no internal symbols leak.

---

## 6. Peer Dependencies & Tested Compatibility

The package maintains **zero runtime dependencies** (`dependencies: {}`).

| Package            | Declared Peer Range    | Tested Baseline     | Notes                                               |
| :----------------- | :--------------------- | :------------------ | :-------------------------------------------------- |
| `react`            | `^18.0.0 \|\| ^19.0.0` | `19.0.0` & `18.3.1` | Verified in isolated consumer smoke apps            |
| `react-dom`        | `^18.0.0 \|\| ^19.0.0` | `19.0.0` & `18.3.1` | Verified in isolated consumer smoke apps            |
| `react-admin`      | `^5.0.0`               | `5.15.3`            | Stable `Store` and `ListContext` APIs across RA 5.x |
| `devextreme`       | `^26.1.0`              | `26.1.4`            | Tested against latest patch release                 |
| `devextreme-react` | `^26.1.0`              | `26.1.4`            | Tested against latest patch release                 |

---

## 7. Package Metadata Audit

- **Name**: `ra-devextreme-grid`
- **Version**: `0.1.0`
- **Type**: `module` (modern ESM)
- **Main / Module**: `./dist/index.js`
- **Types**: `./dist/index.d.ts`
- **Exports**:
  ```json
  {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "default": "./dist/index.js"
    }
  }
  ```
- **Files**: `["dist"]` (plus automatic inclusion of `package.json`, `README.md`, `LICENSE`)
- **Keywords**: `["react", "react-admin", "devextreme", "devextreme-react", "datagrid", "data-grid", "admin", "server-side", "remote"]`
- **License**: `MIT`
- **Author**: `Paul Cunningham`
- **Engines**: Deliberately omitted from `package.json` to prevent artificial bundler constraints.
- **SideEffects**: Deliberately omitted from `package.json` to prevent risky tree-shaking stripping across DevExtreme React component wrappers.

---

## 8. Tarball Inspection

Dry-run inspection of `npm pack --dry-run --json` confirms the release archive contains **22 files** with an unpacked size of **193.9 kB** (packed archive size: **53.8 kB**):

1. `LICENSE` (1,072 B)
2. `README.md` (13,546 B)
3. `package.json` (2,686 B)
4. `dist/index.js` (39,461 B)
5. `dist/index.js.map` (116,607 B)
6. `dist/index.d.ts` (953 B)
7. `dist/DatagridDX.d.ts` (730 B)
8. `dist/DatagridDXPagination.d.ts` (909 B)
9. `dist/DatagridDXRemote.d.ts` (497 B)
10. `dist/filterUtils.d.ts` (2,240 B)
11. `dist/persistence/layoutState.d.ts` (1,256 B)
12. `dist/persistence/useGridLayoutPersistence.d.ts` (620 B)
13. `dist/remote/createGridStore.d.ts` (592 B)
14. `dist/remote/groupingOptions.d.ts` (582 B)
15. `dist/remote/groupResults.d.ts` (273 B)
16. `dist/remote/loadOptions.d.ts` (695 B)
17. `dist/remote/summaryOptions.d.ts` (70 B)
18. `dist/remote/types.d.ts` (2,453 B)
19. `dist/selectionUtils.d.ts` (279 B)
20. `dist/sortUtils.d.ts` (267 B)
21. `dist/types.d.ts` (6,587 B)
22. `dist/useManagedFiltering.d.ts` (1,592 B)

**Excluded Assets Confirmed**:

- Zero tests or test fixtures.
- Zero `.junie/` plans or guidelines.
- Zero `docs/` phase reports.
- Zero Python files, virtual environments, or SQLite database files.
- Zero examples or demo assets.
- Zero DevExtreme proprietary CSS or font assets.

---

## 9. Production Bundle Inspection

The built artifact `dist/index.js` was inspected for externalization:

- **Imports**:
  - `react/jsx-runtime`
  - `react` (`useRef`, `useMemo`, `useCallback`, `useEffect`, `forwardRef`, `useImperativeHandle`)
  - `react-admin` (`useListContext`, `useStoreContext`, `useInRouterContext`, `useRedirect`, `useResourceContext`, `useDataProvider`)
  - `devextreme-react/data-grid`
  - `devextreme-react/pagination`
  - `devextreme/data/custom_store`
- **Result**: **100% externalization** of all React, React-Admin, and DevExtreme modules. Zero bundled styles.

---

## 10. TypeScript Declaration Review

`dist/index.d.ts` and accompanying declarations were verified:

- Generics `<RecordType extends RaRecord>` properly constrain records without falling back to `any`.
- Identifier types (`RecordType['id']`) preserve string and numeric keys.
- Remote query descriptors (`GetGridSortDescriptor`, `GetGridGroupDescriptor`, `GetGridSummaryDescriptor`) match backend query expectations.
- No internal repository paths or development aliases leak into declarations.

---

## 11. Isolated Consumer Smoke Testing

Automated verification script `scripts/test-package.mjs` was created and registered as `pnpm test:package`:

1. Generates the real `.tgz` tarball using `npm pack`.
2. Creates isolated consumer projects in the OS temp directory (`C:\Users\Paul\AppData\Local\Temp\ra-dx-smoke-*`).
3. Installs the packed `.tgz` plus peer dependencies without local repository aliases.
4. Compiles a test application exercising:
   - `DatagridDX` with layout persistence, filter row, and columns.
   - `DatagridDXPagination`.
   - `DatagridDXRemote` with grouping, group paging, summaries, and custom `DatagridDXDataProvider`.
   - Filter utilities `defaultGetDxFilterValue`, `defaultGetRaFilters`, and `parseRaFilterKey`.
5. Executes `tsc --noEmit` and `vite build`.

### Results:

- **React 19 Consumer**: `tsc --noEmit` passed with 0 errors; `vite build` completed in 7.85s.
- **React 18 Consumer**: `tsc --noEmit` passed with 0 errors; `vite build` completed in 6.95s.
- **Verdict**: Dual React compatibility is verified with concrete evidence.

---

## 12. Documentation & Community Standards

- **`README.md`**: Restructured from historical chronological notes into an end-user developer guide featuring value proposition, architecture diagram, feature comparison matrix, copyable managed and remote quick-starts, theme guide, layout persistence guide, and known limitations.
- **`CHANGELOG.md`**: Created with full 0.1.0 release details across Added, Architecture, Examples, Testing, and Known Limitations.
- **`CONTRIBUTING.md`**: Created covering Node/pnpm/Python prerequisites, build/test commands, formatting/linting rules, and PR expectations.
- **`SECURITY.md`**: Created with vulnerability disclosure guidelines via GitHub Security Advisories.
- **`RELEASING.md`**: Created with a 13-step manual release checklist.
- **GitHub Templates**: Added `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, and `.github/PULL_REQUEST_TEMPLATE.md`.

---

## 13. Security & Dependency Audit

- **`pnpm audit`**: 3 moderate vulnerabilities found in development/transitive dependencies (`vitest` mocker and `decode-uri-component` via `ra-core`).
- **Runtime Security**: `ra-devextreme-grid` declares **zero runtime dependencies** (`"dependencies": {}`). Consumers inherit no runtime CVEs from this package.
- **Python Backend**: All 27 dependencies in `examples/remote-fastapi/backend` are locked in `uv.lock`. `ruff check` and `ruff format` passed with zero errors.

---

## 14. Stage Timings Benchmark

Measured execution durations for standard quality and build stages:

| Stage                      | Command                          | Duration         |
| :------------------------- | :------------------------------- | :--------------- |
| **Pnpm Install**           | `pnpm install --frozen-lockfile` | 0.94s            |
| **ESLint**                 | `pnpm lint`                      | 2.10s            |
| **Prettier**               | `pnpm format:check`              | 1.90s            |
| **TypeScript**             | `pnpm typecheck`                 | 3.32s            |
| **Vitest**                 | `pnpm test` (999 tests)          | 17.98s           |
| **Library Build**          | `pnpm build`                     | 3.42s            |
| **Basic Example Build**    | `pnpm build:example`             | 7.76s            |
| **FastAPI Frontend Build** | `pnpm build:remote-fastapi`      | 8.12s            |
| **Python Ruff Check**      | `uv run ruff check .`            | 0.07s            |
| **Python Ruff Format**     | `uv run ruff format --check .`   | 0.07s            |
| **Backend Pytest**         | `uv run pytest` (2,300 tests)    | 8.58s            |
| **Consumer Smoke Test**    | `pnpm test:package` (dual React) | 169.99s (2m 50s) |
| **Browser E2E Suite**      | `pnpm test:e2e` (35 tests)       | 176.36s (2m 56s) |

---

## 15. CI & Portability Review

- **CI Workflow (`.github/workflows/ci.yml`)**: Includes clean jobs for verify (Node 22, pnpm frozen lockfile, lint, format check, typecheck, Vitest, library and example builds, Python Ruff, Pytest) and e2e (Playwright Chromium).
- **Cross-Platform Portability**: Verified that all scripts (`tests/e2e/run.mjs`, `scripts/test-package.mjs`, `playwright.config.ts`) handle Windows and Linux path normalization and URI formatting cleanly.
- **Console Warnings**:
  - DevExtreme evaluation notices (`W0019`, `W0021`) and Inferno development mode logs are expected non-commercial testing notices and do not represent adapter errors.
  - Vite warnings regarding `"use client"` directives from third-party dependencies (`devextreme-react`, `@mui/*`) are safely ignored during bundling.
- **Clean Checkout Simulation**: Verified `pnpm install --frozen-lockfile` and `uv sync --locked` operate idempotently from clean state.

---

## 16. Test Regression Summary

All tests passed with zero regressions:

| Suite              | Component / Area                               | Tests Passed | Status |
| :----------------- | :--------------------------------------------- | :----------- | :----- |
| **Vitest**         | Unit & integration tests                       | **999**      | Pass   |
| **Pytest**         | Backend FastAPI + SQLModel queries             | **2,300**    | Pass   |
| **Playwright**     | Chromium browser end-to-end                    | **35**       | Pass   |
| **Consumer Smoke** | Packed tarball install & build (React 18 & 19) | **2 / 2**    | Pass   |

---

## 17. Full Verification Battery

Every required command completed successfully:

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm lint`
- [x] `pnpm format:check`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm build`
- [x] `pnpm build:example`
- [x] `pnpm build:remote-fastapi`
- [x] `pnpm test:package`
- [x] `uv sync --locked --directory examples/remote-fastapi/backend`
- [x] `uv run --directory examples/remote-fastapi/backend ruff check .`
- [x] `uv run --directory examples/remote-fastapi/backend ruff format --check .`
- [x] `uv run --directory examples/remote-fastapi/backend pytest`
- [x] `pnpm test:e2e`
- [x] `npm pack --dry-run --json`

---

## 18. Known Limitations for 0.1.0

1. **Managed Mode Single-Column Sorting**: Standard React-Admin `ListContext` design supports only single-column sorting. Multi-column sorting requires `DatagridDXRemote`.
2. **Managed Client-Side Paging**: Client paging in DevExtreme is disabled in managed mode; pagination is driven by `DatagridDXPagination`.
3. **Remote Selection Parity**: Remote mode does not yet integrate with React-Admin's cross-page selection state (`selectedIds`).
4. **No Inline Grid Editing**: Neither grid supports DevExtreme cell/row editing; edits use standard React-Admin Edit views.
5. **Remote Query State Persistence Deferred**: Storing remote query state (filter AST, grouping structure, sort descriptors) is deferred to Phase 9B.
6. **DevExtreme Licensing**: DevExtreme is a commercial product; users must have a valid license from Developer Express Inc.

---

## 19. Manual Publication Steps Remaining

The release engineer must personally execute the following manual publication steps:

1. **Ensure Clean Working Tree & Git Status**:
   ```bash
   git status
   ```
2. **Authenticate with npm**:
   ```bash
   pnpm login
   pnpm whoami
   ```
3. **Run Publication Dry Run**:
   ```bash
   pnpm publish --dry-run --access public --no-git-checks
   ```
4. **Publish to npm**:
   ```bash
   pnpm publish --access public --no-git-checks
   ```
5. **Verify Public npm Release**:
   ```bash
   pnpm view ra-devextreme-grid@0.1.0
   ```
6. **Create and Push Git Tag**:
   ```bash
   git tag -a v0.1.0 -m "Release v0.1.0"
   git push origin v0.1.0
   ```
7. **Create GitHub Release**:
   - Title: `ra-devextreme-grid v0.1.0`
   - Tag: `v0.1.0`
   - Content: Copy notes from `CHANGELOG.md` under `## [0.1.0]`.

---

## 20. Suggested Release Metadata

- **Publish Command**: `pnpm publish --access public --no-git-checks`
- **Git Tag**: `v0.1.0`
- **GitHub Release Title**: `ra-devextreme-grid v0.1.0`

### Recommended GitHub Repository Settings

- **About Description**: "DevExtreme DataGrid integration for React-Admin with managed and remote server operations"
- **Topics**: `react`, `react-admin`, `devextreme`, `devextreme-react`, `datagrid`, `data-grid`, `server-side`, `fastapi`
- **Security**: Enable private vulnerability reporting under Repository Settings -> Security -> Advisories.
- **Discussions**: Enable GitHub Discussions for community questions.

---

## 21. Deferred Roadmap

**Phase 9B (Remote Query-State Persistence) and Phase 10 (Inline Editing) remain deliberately frozen pending real-world community feedback on release 0.1.0.**

---

## 22. Final Recommendation

The package `ra-devextreme-grid` version `0.1.0` has met all hardening criteria with zero regressions across unit, backend, browser, and package consumer testing. The repository is ready for the developer to execute the manual publication checklist in `RELEASING.md`.
