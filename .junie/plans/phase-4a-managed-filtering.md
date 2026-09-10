---
sessionId: session-260910-213502-f4p6
---

# Requirements

### Overview & Goals
Phase 4A implements **Managed React-Admin Filtering with DevExtreme Filter Row** for `ra-devextreme-grid`. The goal is to provide DevExtreme's native DataGrid Filter Row UI while keeping React-Admin's `ListContext` (`filterValues` and `setFilters()`) as the sole authoritative owner of list filtering state.

The architectural invariant remains:
```text
DevExtreme Filter Row
        ↓
DevExtreme filter expression
        ↓
ra-devextreme-grid translation (getRaFilters)
        ↓
React-Admin setFilters()
        ↓
dataProvider.getList()
        ↓
server-filtered page
        ↓
ListContext.data
        ↓
DatagridDX
```

### Scope
- **In Scope**:
  - Opt-in `filtering` prop on `DatagridDX` supporting boolean enablement or `DatagridDXFilterRowOptions`.
  - DevExtreme Filter Row presentation and interaction controls.
  - Translation layer between DevExtreme filter expressions and React-Admin flat filter objects (`_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_q`, `between`).
  - Suffix parsing that supports column names with underscores (e.g., `company_name_q`, `created_at_gte`).
  - Plain React-Admin field mapping to grid equality filters.
  - Bidirectional synchronization with semantic equality check and feedback-loop guard.
  - Preservation of external, unrelated React-Admin filter parameters (e.g., global `q` or backend flags).
  - Automatic pagination reset owned by React-Admin (no redundant adapter `setPage(1)` calls).
  - Debounced React-Admin updates (`setFilters(..., ..., true)`).
  - Omission and control of conflicting native DevExtreme filtering props.
  - Coexistence with single-column sorting, cross-page selection, and row navigation (`rowClick`).
  - Public conversion escape hatches: `getRaFilters` and `getDxFilterValue`.
  - Comprehensive unit, component, and integration tests.
  - Example app update with filter-aware in-memory `dataProvider`.
  - Plan documentation file `.junie/plans/005-phase-4a-managed-filtering.md`.
- **Out of Scope**:
  - Remote mode / `CustomStore` / `DatagridDXRemote` (Phase 5).
  - Header Filter, Filter Builder, Filter Panel, Search Panel (deferred to Phase 4B or Phase 5).
  - Arbitrary `OR` or `NOT` compound logic in the default converter.
  - Column Chooser, column resizing, reordering, state persistence (Phase 4B).
  - Inline editing, bulk mutation toolbars, Python backend code.

### User Stories
- **US-1**: As an admin user, I want to type a query into a column's Filter Row cell so that the grid displays server-filtered records matching my query.
- **US-2**: As an admin user, I want to filter by text (`contains`, `=`, `<>`) and numeric/date ranges (`>`, `>=`, `<`, `<=`, `between`) using DevExtreme's operation chooser so that I can narrow down my search precisely.
- **US-3**: As an admin user, when I apply a filter while on page 2, the grid should automatically return to page 1 to show the first page of matching records.
- **US-4**: As an admin user, I want my active selection and sort order preserved when applying or clearing filters.
- **US-5**: As a developer, I want external React-Admin filter components (like global search bars) to cooperate with the grid's Filter Row without either one overwriting or destroying the other.
- **US-6**: As a developer, I want custom converter callbacks (`getRaFilters`, `getDxFilterValue`) so that I can map Filter Row expressions to non-standard backend query formats.

### Functional Requirements
1. **Filter Row Enablement**:
   - `filtering={false}` or `undefined`: Filter Row is disabled (`visible: false`).
   - `filtering={true}`: Filter Row enabled with default presentation (`visible: true`, `showOperationChooser: true`, `applyFilter: 'auto'`).
   - `filtering={{ ... }}`: Filter Row enabled with custom options matching `DatagridDXFilterRowOptions`.
2. **Default Suffix & Operator Convention**:
   - DevExtreme `=` → React-Admin `field_eq`
   - DevExtreme `<>` → React-Admin `field_neq`
   - DevExtreme `>` → React-Admin `field_gt`
   - DevExtreme `>=` → React-Admin `field_gte`
   - DevExtreme `<` → React-Admin `field_lt`
   - DevExtreme `<=` → React-Admin `field_lte`
   - DevExtreme `contains` → React-Admin `field_q`
   - DevExtreme `between` with `[min, max]` → React-Admin `field_gte: min` and `field_lte: max`
   - Plain React-Admin `field: value` → DevExtreme `['field', '=', value]` when `field` matches a grid column.
3. **Underscore Handling**:
   - Suffix parsing must examine the end of keys against known suffixes (`_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_q`). For instance, `company_name_q` must parse to field `company_name` and operator `contains`.
4. **Preservation of Unrelated Filters**:
   - Any key in React-Admin's `filterValues` that does not correspond to an active grid column (e.g. `q`, `status_filter`) must be retained intact when grid filters are added, updated, or cleared.
5. **Debouncing**:
   - Grid-initiated updates must call `setFilters(nextFilters, displayedFilters, true)` to engage React-Admin v5's debounced filter dispatching.
6. **Coexistence with Grid Features**:
   - **Sorting**: Sorting columns must not wipe out active filters; applying filters must not wipe out active sort order.
   - **Selection**: Cross-page selected IDs must remain in React-Admin's selection store even if filtered off the visible page.
   - **Navigation**: Clicks within Filter Row editor cells (`rowType === 'filter'`) must never trigger `rowClick` navigation.
7. **Safe Failure on Unsupported Expressions**:
   - If an unsupported operator (e.g. `startswith`) or unsupported boolean structure (`OR`, `NOT`) is encountered, the default converter must emit a development warning and omit the invalid filter rather than corrupting the query.

### Non-Functional Requirements
- **Single Fetch Owner**: React-Admin's `ListContext` remains the sole fetch initiator. DevExtreme must not initiate independent data requests.
- **Feedback-Loop Safety**: Deep semantic equality checks and synchronization lock refs ensure zero ping-pong render cycles between React-Admin and DevExtreme.
- **Bundle & Declaration Cleanliness**: No large external deep-equal libraries; all public types cleanly exported; peer dependencies externalized.

# Technical Design

### Current Implementation
`DatagridDX` is currently a managed wrapper around DevExtreme `DataGrid`. It binds `dataSource={data}` from `useListContext()` and projects single-column sorting (`sort`), cross-page selection (`selectedIds`, `onSelect`), row navigation (`rowClick`), and loading overlays. Conflicting native props (`dataSource`, `keyExpr`, `paging`, `sorting`, `selection`, etc.) are omitted from `DatagridDXProps`.

### Key Decisions
1. **Public API Contract**:
   - Prop: `filtering?: boolean | DatagridDXFilterRowOptions`.
   - `DatagridDXFilterRowOptions` derives from DevExtreme `FilterRow` options, omitting `visible` (which is managed by the adapter).
   - Conflicting DevExtreme native filter props (`filterRow`, `filterValue`, `defaultFilterValue`, `filterSyncEnabled`, `headerFilter`, `filterPanel`, `filterBuilder`, `filterBuilderPopup`, `searchPanel`) are omitted from `DatagridDXProps` to prevent accidental current-page local filtering bypasses.
   - Rationale: Provides a clean opt-in API consistent with `selection?: boolean | DatagridDXSelectionOptions` from Phase 3.
2. **Extraction of Pure Conversion Logic**:
   - All mapping, parsing, merging, and comparison functions reside in `src/filterUtils.ts`.
   - Rationale: Keeps `DatagridDX.tsx` concise and readable while enabling isolated, deterministic unit testing of complex parsing scenarios.
3. **Internal Hook Modularization**:
   - Introduce `useManagedFiltering` internal hook to encapsulate bidirectional synchronization, DevExtreme event listening, and debounce dispatching.
   - Rationale: Satisfies Section 47's recommendation to prevent `DatagridDX.tsx` from growing into an unmaintainable single-file monolith.
4. **DevExtreme Client-Side Filtering Invariant & Remote Operations**:
   - In an array-backed DataGrid (`dataSource: [...]`), when `filterValue` is set, DevExtreme normally evaluates the filter client-side.
   - However, configuring `remoteOperations={{ filtering: true }}` informs DevExtreme that filtering is performed externally, preventing it from incorrectly eliminating server-filtered records from the current page array when client and server filter semantics differ.
   - In tandem, `filterSyncEnabled: true` ensures that column Filter Row inputs reliably update the grid-level `filterValue` option.
5. **Bidirectional Sync & Feedback Guard**:
   - React-Admin → DevExtreme: Synchronize active grid filters into DevExtreme `filterValue` using `lastSyncedFilterRef` and deep semantic comparison (`isFilterValueEqual`).
   - DevExtreme → React-Admin: Listen to `e.name === 'filterValue'` in `onOptionChanged`. If not currently syncing from React-Admin, translate the expression with `getRaFilters` (preserving non-grid keys) and call `setFilters(mergedFilters, displayedFilters, true)`.

### Architecture Diagram
```mermaid
graph TD
    subgraph DevExtreme DataGrid
        FR[Filter Row Editor Input] -->|native optionChange| FV[DataGrid filterValue]
        FV -->|e.name === 'filterValue'| OF[useManagedFiltering Hook]
        DFV[DataGrid filterValue prop] -->|sync active filters| FR
    end

    subgraph Translation Layer (filterUtils.ts)
        OF -->|raw DX expression| TR[getRaFilters]
        TR -->|merge with unrelated filters| MR[Merged RA Filters]
        RA_FV[React-Admin filterValues] -->|extract grid columns| TD[getDxFilterValue]
        TD -->|DX filter expression| DFV
    end

    subgraph React-Admin ListContext
        MR -->|setFilters debounced| LC[React-Admin Controller]
        LC -->|resets page to 1| PR[Page Reset]
        LC -->|dataProvider.getList| DP[dataProvider]
        DP -->|server-filtered page| LD[ListContext.data]
        LC -->|filterValues update| RA_FV
    end

    LD -->|dataSource| DX[DataGridDX Table]
```

### Data Models & Type Signatures
```ts
// src/types.ts
import type { FilterRow as DxGridFilterRow } from 'devextreme/common/grids';
import type { RaRecord } from 'react-admin';

export type DatagridDXFilterRowOptions = Omit<DxGridFilterRow, 'visible'>;

export interface DatagridDXFilterContext {
  previousFilters: Record<string, any>;
  gridColumns: string[];
}

export type DatagridDXGetRaFilters = (
  dxFilter: any,
  context: DatagridDXFilterContext
) => Record<string, any>;

export type DatagridDXGetDxFilterValue = (
  raFilters: Record<string, any>,
  context: { gridColumns: string[] }
) => any;

export type DatagridDXProps<RecordType extends RaRecord = RaRecord> = Omit<
  IDataGridOptions<RecordType, RecordType['id']>,
  | 'dataSource'
  | 'keyExpr'
  | 'paging'
  | 'pager'
  | 'sorting'
  | 'remoteOperations'
  | 'selection'
  | 'selectedRowKeys'
  | 'defaultSelectedRowKeys'
  | 'selectionFilter'
  | 'defaultSelectionFilter'
  | 'filterRow'
  | 'filterValue'
  | 'defaultFilterValue'
  | 'filterSyncEnabled'
  | 'headerFilter'
  | 'filterPanel'
  | 'filterBuilder'
  | 'filterBuilderPopup'
  | 'searchPanel'
> & {
  selection?: boolean | DatagridDXSelectionOptions;
  rowClick?: DatagridDXRowClick;
  filtering?: boolean | DatagridDXFilterRowOptions;
  getRaFilters?: DatagridDXGetRaFilters;
  getDxFilterValue?: DatagridDXGetDxFilterValue;
};
```

### File Structure & Changes
- `src/filterUtils.ts` *(new)*:
  - `parseRaFilterKey(key: string)`: splits key from end by known suffixes (`_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_q`).
  - `defaultGetRaFilters(dxFilter, context)`: transforms DevExtreme array expressions into React-Admin query object.
  - `defaultGetDxFilterValue(raFilters, context)`: transforms React-Admin query object into DevExtreme nested `AND` array expression.
  - `isFilterValueEqual(a, b)`: structural equality checker for DevExtreme filter expressions.
  - `getManagedColumnFields(columns, children)`: discovers active column data fields that allow filtering.
- `src/useManagedFiltering.ts` *(new)*:
  - Internal hook managing sync refs, React-Admin `setFilters` calls, and DevExtreme Filter Row props.
- `src/types.ts`:
  - New filtering types and updated `DatagridDXProps`.
- `src/DatagridDX.tsx`:
  - Hook consumption, unified `handleOptionChanged`, and prop wiring.
- `src/index.ts`:
  - Export new public types.
- `examples/basic/App.tsx`:
  - In-memory dataProvider filter implementation (`_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_q`, range pairs).
  - Filter Row enabled on customer grid with configured column operators.
  - External React-Admin filter demonstrating non-grid filter preservation.
- `tests/filterUtils.test.ts` *(new)*:
  - Comprehensive unit test suite for converters, underscore handling, and edge cases.
- `tests/filtering.test.tsx` *(new)*:
  - Component integration tests for DatagridDX filtering.
- `tests/integration.test.tsx`:
  - End-to-end `AdminContext` + `ListBase` filtering and page-reset assertions.
- `.junie/plans/005-phase-4a-managed-filtering.md` *(new)*:
  - Comprehensive architectural plan file.
- `README.md`:
  - Documentation and roadmap status updates.

### Risks & Mitigations
- **Feedback Loops**: Programmatic synchronization could trigger DevExtreme `onOptionChanged` resulting in recursive `setFilters` dispatches. *Mitigation*: Track synchronization in progress with `isSyncingRef` and verify expression value differences with `isFilterValueEqual` before dispatching.
- **Underscore Suffix Ambiguity**: Column names such as `user_created_at_gte` could be misparsed if naive splitting is used. *Mitigation*: Match known suffixes strictly from the end of the string using regular expression anchoring (`/(.*)_(eq|neq|gt|gte|lt|lte|q)$/`).
- **DevExtreme Current-Page Filtering Divergence**: In managed mode, DevExtreme only sees the current page. If DevExtreme filters the array locally with different rules than the server, records could disappear. *Mitigation*: Configure `remoteOperations={{ filtering: true }}` to notify DevExtreme that filtering is executed on the server, and recommend that column operation choosers match supported server operations.

# Testing

### Validation Approach
Verification follows a tiered testing strategy:
1. **Isolated Pure Unit Tests (`tests/filterUtils.test.ts`)**: Exhaustively test expression conversion, reverse parsing, underscore preservation, equality checks, and unsupported operator warnings.
2. **Component Integration Tests (`tests/filtering.test.tsx`)**: Test `DatagridDX` under simulated user interactions, option changes, and external React-Admin state mutations.
3. **End-to-End ListBase Tests (`tests/integration.test.tsx`)**: Validate real `AdminContext` + `ListBase` query flows asserting actual `dataProvider.getList` parameters and page reset behavior.
4. **Build & Package Sanity**: Automated lint, format, typecheck, production build, example build, and package dry-run.

### Key Scenarios & Test Matrix
#### Filter Utilities Tests (`tests/filterUtils.test.ts`)
- **A. Contains**: `['name', 'contains', 'smith']` → `{ name_q: 'smith' }`
- **B. Equality**: `['country', '=', 'UK']` → `{ country_eq: 'UK' }`
- **C. Not Equal**: `['status', '<>', 'inactive']` → `{ status_neq: 'inactive' }`
- **D. Numeric Comparisons**: `>`, `>=`, `<`, `<=` map to `_gt`, `_gte`, `_lt`, `_lte`.
- **E. Between**: `['price', 'between', [10, 50]]` → `{ price_gte: 10, price_lte: 50 }`
- **F. Multiple AND Filters**: Flattened into a single combined React-Admin filter object.
- **G. Underscores in Field Names**: `company_name_q` → `company_name` + `contains`; `created_at_gte` → `created_at` + `>=`.
- **H. Plain RA Fields**: `{ country: 'UK' }` maps to `['country', '=', 'UK']` when `country` is a valid column.
- **I. Suffixed RA Fields**: `{ age_gte: 18 }` maps to `['age', '>=', 18]`.
- **J. Range Round-Trip**: Combined `{ price_gte: 10, price_lte: 50 }` maps to `between` expression.
- **K. Unknown/External Fields**: Keys not matching any grid column are excluded from DevExtreme filter value.
- **L. Unsupported Operations/OR/NOT**: Fails safely, logs development warning, does not corrupt query.

#### Managed Grid Component Tests (`tests/filtering.test.tsx`)
- **M. Disabled by Default**: With `filtering={false}` / omitted, no Filter Row is enabled.
- **N. Enable Filter Row**: `filtering={true}` enables Filter Row with default options.
- **O. Filter Row → setFilters**: Changing Filter Row editor dispatches `setFilters` with mapped query.
- **P. Debounce Flag**: `setFilters` is called with `(nextFilters, displayedFilters, true)`.
- **Q. External filterValues → Filter Row**: Mutating React-Admin `filterValues` updates DevExtreme Filter Row.
- **R. Feedback Loop Protection**: Programmatic synchronization does not invoke `setFilters` repeatedly.
- **S. Clearing Filter**: Removing a Filter Row value deletes only the corresponding managed keys.
- **T. Preserve Unrelated Filter**: External React-Admin filter (e.g. `q: 'search'`) survives Filter Row edits.
- **U. Combined Filters**: Multiple column filters produce properly merged React-Admin filter objects.
- **V. Consumer onOptionChanged**: Consumer handler is called exactly once per event.
- **W. Sorting Coexistence**: Sorting a column does not reset filters; filtering does not reset sort order.
- **X. Selection Coexistence**: Filtering does not clear off-page selected IDs from React-Admin state.
- **Y. Navigation Isolation**: Clicking or editing inside Filter Row cells does not trigger `rowClick` navigation.

#### Realistic Integration Tests (`tests/integration.test.tsx`)
- **Paging Reset Integration**: From page 2, user enters a filter. Assert `dataProvider.getList` receives `page: 1` with the new filter and existing sort.
- **Single Fetch Owner**: Confirm only one `dataProvider.getList` query is executed per filter event (no auxiliary DevExtreme queries).
- **Client-Side Filtering Behavior**: Confirm server-filtered records returned by dataProvider render faithfully in the grid without being dropped by client-side filters.

### Automated Verification Pipeline
All of the following must pass with zero errors:
```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm build:example
pnpm pack --json
```

# Delivery Steps

### ✓ Step 1: Implement filter conversion utilities and unit tests
Implement pure filter expression translation utilities and test them thoroughly in isolation.

- Create `src/filterUtils.ts` containing:
  - Default forward converter (`defaultGetRaFilters`): maps DevExtreme expressions (`=`, `<>`, `>`, `>=`, `<`, `<=`, `contains`, `between`) to React-Admin flat query objects (`_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_q`, range pairs).
  - Reverse converter (`defaultGetDxFilterValue`): parses React-Admin query keys from the end using known suffixes (supporting column names with underscores like `created_at_gte`), mapping plain column keys to equality expressions and range pairs to `between`.
  - Filter expression deep equality helper (`isFilterValueEqual`): compares DevExtreme nested filter arrays, primitives, nulls, and dates to prevent redundant synchronization cycles.
  - Column validation helper (`getManagedColumnFields`): extracts allowable filter fields from grid column metadata and JSX children, filtering out non-string fields and columns with `allowFiltering === false`.
  - Unrelated filter merger (`mergeRaFilters`): preserves external React-Admin filters (such as `q` or backend flags) when updating or clearing grid-managed column filters.
- Create unit test file `tests/filterUtils.test.ts` covering test cases A through L:
  - Contains (`_q`), equality (`_eq`), inequality (`_neq`), numeric comparisons (`_gt`, `_gte`, `_lt`, `_lte`), and range `between`.
  - Combined `AND` expressions and nested `AND` structures.
  - Suffix extraction on underscore-containing column names (`company_name_q`, `created_at_gte`).
  - Safe failure/fallback and console warning on unsupported operators (e.g. `startswith`, `endswith`) or unsupported `OR`/`NOT` logic.
  - Merging and preserving unrelated filter keys.

### ✓ Step 2: Add managed filtering types, hook, and DatagridDX integration
Introduce public filtering types, the managed filtering hook, and wire filtering into DatagridDX.

- Update `src/types.ts`:
  - Define `DatagridDXFilterRowOptions` (derived from DevExtreme `FilterRow` options, omitting `visible`).
  - Define `DatagridDXGetRaFilters` and `DatagridDXGetDxFilterValue` converter callback types.
  - Extend `DatagridDXProps` with `filtering?: boolean | DatagridDXFilterRowOptions`, `getRaFilters?: DatagridDXGetRaFilters`, and `getDxFilterValue?: DatagridDXGetDxFilterValue`.
  - Omit conflicting native filter properties from `DatagridDXProps` (`filterRow`, `filterValue`, `defaultFilterValue`, `filterSyncEnabled`, `headerFilter`, `filterPanel`, `filterBuilder`, `filterBuilderPopup`, `searchPanel`).
- Export new types from `src/index.ts`.
- Create `src/useManagedFiltering.ts` internal hook:
  - Inspect `filterValues` and `setFilters` from React-Admin's `useListContext`.
  - Maintain bidirectional synchronization state and feedback-loop guard (`isFilteringSyncingRef`, `lastSyncedFilterRef`).
  - Configure DevExtreme Filter Row props (`visible`, `applyFilter: 'auto'`, `showOperationChooser: true`) when `filtering` is active.
  - Enable `filterSyncEnabled: true` and configure `remoteOperations` so DevExtreme does not inappropriately discard server-filtered records from the current page.
  - Translate DevExtreme `filterValue` changes to `setFilters(nextFilters, displayedFilters, true)` to trigger React-Admin debounced filtering.
  - Translate React-Admin `filterValues` changes into DevExtreme `filterValue` updates.
- Refactor `DatagridDX.tsx`:
  - Integrate `useManagedFiltering` alongside sorting, selection, and navigation handlers.
  - Update `handleOptionChanged` to route `e.name === 'filterValue'` changes while preserving consumer `onOptionChanged` invocations and existing sorting behavior.
  - Verify that `onRowClick` ignores Filter Row cells (`e.rowType === 'filter'`).

### ✓ Step 3: Add component and integration test suite
Create integration and component tests to verify the managed Filter Row contract, debounce behavior, and isolation from sorting/selection/navigation.

- Create `tests/filtering.test.tsx` testing managed filtering in component isolation:
  - Filtering disabled by default (no Filter Row rendered, no filter listeners).
  - Enabling `filtering={true}` and passing custom `DatagridDXFilterRowOptions`.
  - Filter Row change dispatches `setFilters(..., ..., true)` with the debounced flag enabled.
  - External React-Admin `filterValues` change updates the visible DevExtreme Filter Row.
  - Feedback-loop prevention: programmatic DevExtreme option update does not trigger redundant `setFilters` calls.
  - Clearing a grid filter removes only the corresponding managed keys and preserves external filters (e.g. `q`).
  - Interacting with Filter Row does not trigger row navigation (`onRowClick`).
  - Consumer `onOptionChanged` is called exactly once per option change.
  - Coexistence with selection: filtering does not clear off-page selected IDs.
  - Coexistence with single-column sorting: sorting and filtering operate concurrently without state destruction.
- Update `tests/integration.test.tsx`:
  - Test realistic end-to-end flow with `AdminContext` + `ListBase` + `DatagridDX` + `DatagridDXPagination`.
  - Verify filtering from page 2 causes React-Admin to reset page to 1 and call `dataProvider.getList` with `{ pagination: { page: 1 }, filter: { ... } }`.
  - Verify single network request ownership: verify no secondary DevExtreme DataSource queries are initiated.
  - Add client-side filter reapplication investigation test confirming server-filtered page records are correctly rendered.

### ✓ Step 4: Update example application with filterable dataProvider and UI
Update the sample dataset and dataProvider in the example application to handle managed filters and showcase Filter Row UI.

- Update `examples/basic/App.tsx`:
  - Upgrade in-memory `dataProvider.getList` to filter records by `_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_q`, and range `gte + lte` pairs before computing `total` and slicing pagination.
  - Add filterable columns to `DatagridDX` with explicit `selectedFilterOperations` restricting the operation chooser to supported operators (`contains`, `=`, `<>` for text; `=`, `<>`, `>`, `>=`, `<`, `<=`, `between` for numeric/date).
  - Enable `filtering` on `DatagridDX`.
  - Include an external React-Admin filter (e.g. an external search input or `q` filter) in the view to demonstrate bidirectional synchronization and unrelated filter preservation.
  - Verify manual interaction flows in the browser example: pagination reset, sorting coexistence, cross-page selection persistence, and navigation isolation.

### ✓ Step 5: Documentation, plan record, and validation suite
Write the Phase 4A plan file, update README documentation, and execute full validation checks.

- Create `.junie/plans/005-phase-4a-managed-filtering.md` documenting:
  - Architecture, translation model, conversion table, reverse parsing, underscore handling.
  - Feedback-loop protection, debouncing, pagination/sorting/selection coexistence.
  - Client-side filter reapplication investigation findings.
  - Unsupported operations and risks.
- Update `README.md`:
  - Document the opt-in `filtering` prop and configuration options.
  - Document default suffix conventions and custom conversion callbacks (`getRaFilters`, `getDxFilterValue`).
  - Document external filter preservation and debouncing behavior.
  - Clarify current limitations (no Header Filter, no arbitrary OR/NOT, managed sorting remains single-column).
  - Update roadmap status (Phase 4A Completed, Phase 4B Next).
- Run full automated verification suite:
  - `pnpm lint`
  - `pnpm format:check`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - `pnpm build:example`
  - `pnpm pack --json`
- Inspect generated `.d.ts` declaration files and build bundle to ensure clean exports and externalized peer dependencies.