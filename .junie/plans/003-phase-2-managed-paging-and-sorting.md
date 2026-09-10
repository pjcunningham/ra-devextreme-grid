# Phase 2 Implementation Plan — Managed Paging and Single-Column Sorting

## 1. Architectural Baseline & Context
Phase 1 transitioned `ra-devextreme-grid` from a proof-of-installation standalone component into a genuine React-Admin managed grid:
- `DatagridDX` reads `{ data, isPending, isFetching }` exclusively from React-Admin's `useListContext<RecordType>()`.
- DevExtreme `DataGrid` receives `dataSource={data ?? []}` and `keyExpr="id"`.
- Paging was explicitly disabled (`paging={{ enabled: false }}`) and interactive sorting was disabled (`sorting={{ mode: 'none' }}`).
- React-Admin serves as the sole data-fetching owner (`dataProvider.getList()`).

In Phase 2, we integrate React-Admin's managed pagination and single-column sorting while strictly preserving React-Admin as the single source of truth:
```text
React-Admin ListController
        ↓
   ListContext
        ↓
ra-devextreme-grid
        ↓
  DevExtreme UI
```

React-Admin remains the sole owner of:
- Remote data fetching (`dataProvider.getList()`);
- Current page index (`page`);
- Page size (`perPage`);
- Total record count (`total`);
- Active sort field (`sort.field`);
- Active sort order (`sort.order`).

DevExtreme provides the UI presentation:
- Visual sort indicators on table column headers;
- Interactive column header click handling for single-column sorting;
- Visual pagination controls via DevExtreme's standalone `Pagination` component.

---

## 2. Pagination Architecture & Standalone Strategy

### Why DataGrid Internal Paging Must Remain Disabled
In React-Admin's architecture, data fetching is page-oriented: `dataProvider.getList()` is invoked with `pagination: { page, perPage }` and returns a slice of records (e.g. 10 items) along with the overall `total` (e.g. 100 items).
If DevExtreme `DataGrid`'s internal paging were enabled:
- DevExtreme would receive the 10-item page and attempt to paginate it locally (e.g., displaying page 1 of 1 with 10 records, or paging 10 records into smaller sub-slices).
- DevExtreme's built-in pager would know only about the local 10 records, not the global dataset `total`.
- This would create an architectural contradiction: a server page paginated again locally by DevExtreme.

Therefore, `DataGrid` must continue to enforce:
```tsx
paging={{ enabled: false }}
```
Furthermore, `paging` and `pager` options are removed from the public `DatagridDXProps` interface to prevent consumers from accidentally enabling internal paging.

### Standalone DevExtreme Pagination Integration
React-Admin delegates pagination to `<List pagination={<CustomPagination />}>`.
We introduce a standalone, exported component:
```tsx
<DatagridDXPagination />
```
backed by DevExtreme's standalone `Pagination` widget (`devextreme-react/pagination`).

Primary usage:
```tsx
<List
  perPage={10}
  pagination={<DatagridDXPagination allowedPageSizes={[5, 10, 25]} />}
>
  <DatagridDX<Customer>>
    <Column dataField="id" caption="ID" />
    <Column dataField="name" caption="Customer" />
  </DatagridDX>
</List>
```

Advantages of separating `DatagridDX` and `DatagridDXPagination`:
1. Clean separation of concerns matching React-Admin's component model.
2. Eliminates duplicate pagers (standard React-Admin Material pager vs DevExtreme pager).
3. Gives consumers freedom to configure or swap pagers as needed.

---

## 3. React-Admin Context Mapping & Mechanics

### Pagination State Mapping
DevExtreme's standalone `Pagination` maps directly to React-Admin `ListContext`:
- `pageIndex` in DevExtreme `Pagination` is 1-based (verified via DevExtreme source/typings: `pageIndex` is 1-based in dxPagination). This aligns with React-Admin's 1-based `page`. No `+1` / `-1` offset manipulation is required.
- `pageSize` maps to `perPage`.
- `itemCount` maps to `total`.
- `onPageIndexChange`: Invokes `setPage(newPage)` exactly once.
- `onPageSizeChange`: Invokes `setPerPage(newSize)` exactly once.

### Single-Invocation Guarantee
When the user changes the page size, React-Admin's `setPerPage()` internally handles resetting the page index to 1. The adapter must invoke only `setPerPage(newSize)` and must not redundantly invoke `setPage(1)`.

### Partial Pagination / Unknown Total
If a data provider does not return `total` (`total === undefined` or `null`), DevExtreme `Pagination` cannot reliably render page buttons or record counts without inventing a fake total.
- Graceful behavior: When `total === undefined || total === null`, `DatagridDXPagination` renders `null`.
- This avoids false total counts or fake page calculations, failing safely.

---

## 4. Managed Single-Column Sorting Architecture

### Single-Column Restriction
React-Admin's `ListContext` represents sort state as a single object:
```ts
{
  field: string;
  order: 'ASC' | 'DESC';
}
```
It does not accommodate an ordered array of multiple sorting columns.
Therefore, `DatagridDX` is configured with DevExtreme single-column sorting:
```tsx
sorting={{ mode: 'single' }}
```
DevExtreme naturally restricts sorting interactions to one column at a time and cycles sort order on successive clicks. Multi-column sorting (e.g. via Shift-click) is disabled.

### Sort Direction Conversion
- React-Admin `'ASC'` ↔ DevExtreme `'asc'`
- React-Admin `'DESC'` ↔ DevExtreme `'desc'`
Internal helper functions in `src/sortUtils.ts` handle deterministic bidirectional conversion.

### Eligible Sort Columns & Column Resolution
A column participates in React-Admin server sorting if and only if:
1. It has a non-empty string `dataField`.
2. `allowSorting !== false`.
Columns without a string `dataField` (such as command columns, template/button columns, or computed expression columns) and columns with `allowSorting === false` are ignored and do not trigger sort actions.

---

## 5. Technical Investigation: DevExtreme In-Memory Array Sorting

### Finding
When DevExtreme `DataGrid` receives an in-memory JavaScript array as `dataSource` and `sorting={{ mode: 'single' }}` is active, DevExtreme's internal `ArrayStore` and `arrayQueryImpl` (`SortIterator`) execute an in-memory client-side sort over the array when a column header is clicked.

### Invariant & Mitigation
In React-Admin managed mode, the server-provided order is authoritative:
1. When a user clicks a column header, DevExtreme fires `onOptionChanged` (for `columns[i].sortOrder`).
2. `DatagridDX` intercepts this event and calls `setSort({ field, order })`.
3. React-Admin immediately marks the list as fetching (`isFetching: true`).
4. `DatagridDX`'s loading effect immediately invokes `grid.beginCustomLoading('')`.
5. The loading overlay covers the grid rows, preventing the user from interacting with or being misled by any transient local client-sorted slice.
6. React-Admin's `dataProvider.getList()` resolves with the true server-sorted page.
7. `ListContext.data` updates and `isFetching` becomes `false`, clearing the loading overlay.
8. DevExtreme renders the authoritative server-sorted page.

This guarantees the **Server-Order Invariant**: React-Admin's fetched record order is authoritative, and the grid settles on the server-provided dataset.

---

## 6. Bidirectional Synchronization & Feedback-Loop Guard

### The Challenge
1. When React-Admin `sort` changes (initial render or external update like URL navigation), `DatagridDX` must update DevExtreme's column visual indicator via `grid.columnOption(field, 'sortOrder', dxOrder)`.
2. Calling `columnOption` programmatically triggers DevExtreme's `onOptionChanged`.
3. If `onOptionChanged` naively calls `setSort()`, an infinite feedback loop would occur.
4. Conversely, when a user clicks a column header, `onOptionChanged` fires and must call `setSort()`.

### The Solution: Mutable Guard Refs
Inside `DatagridDX`:
- `isSyncingRef = useRef(false)`
- `lastSyncedSortRef = useRef<SortPayload | null>(null)`

Flow:
- **External Update (React-Admin → DevExtreme)**:
  1. An effect detects `sort.field` or `sort.order` changed compared to `lastSyncedSortRef.current`.
  2. Set `isSyncingRef.current = true`.
  3. Update DevExtreme column options (`columnOption(field, 'sortOrder', dxOrder)`).
  4. Update `lastSyncedSortRef.current = sort`.
  5. Reset `isSyncingRef.current = false` synchronously or immediately after option updates.
- **User Header Click (DevExtreme → React-Admin)**:
  1. User clicks header; DevExtreme triggers `onOptionChanged`.
  2. `onOptionChanged` checks `isSyncingRef.current`. If `true`, it ignores the event.
  3. If `false`, it extracts the column's `dataField` and new `sortOrder`.
  4. If valid, it records `lastSyncedSortRef.current = { field, order }` and calls `setSort({ field, order })`.
  5. When React-Admin updates context and re-renders `DatagridDX`, `sort` matches `lastSyncedSortRef.current`, so no programmatic column update or loop occurs.

### Consumer Event Composition
If the consumer supplies `onOptionChanged` to `DatagridDX`:
```tsx
const handleOptionChanged = useCallback((e: ColumnOptionChangedEvent) => {
  handleInternalSortChange(e);
  props.onOptionChanged?.(e);
}, [props.onOptionChanged, handleInternalSortChange]);
```
The internal sort handler runs first, and the consumer's callback is always invoked with the exact DevExtreme event object.

---

## 7. Public API & Type Tightening

### `src/types.ts`
```ts
import type { IDataGridOptions } from 'devextreme-react/data-grid';
import type { IPaginationOptions } from 'devextreme-react/pagination';
import type { RaRecord } from 'react-admin';

export type DatagridDXProps<RecordType extends RaRecord = RaRecord> = Omit<
  IDataGridOptions<RecordType, RecordType['id']>,
  'dataSource' | 'keyExpr' | 'paging' | 'pager' | 'sorting' | 'remoteOperations'
>;

export type DatagridDXPaginationProps = Omit<
  IPaginationOptions,
  | 'pageIndex'
  | 'pageSize'
  | 'itemCount'
  | 'defaultPageIndex'
  | 'defaultPageSize'
  | 'onPageIndexChange'
  | 'onPageSizeChange'
>;
```

### `src/index.ts`
```ts
export { DatagridDX } from './DatagridDX';
export { DatagridDXPagination } from './DatagridDXPagination';
export type { DatagridDXProps, DatagridDXPaginationProps } from './types';
```

---

## 8. Roadmap & Documentation Corrections
In `README.md`:
- Clarify that Phase 2 managed mode supports **single-column server sorting**.
- Document that **multi-column sorting** is deferred to future remote mode (`DatagridDXRemote` in Phase 5), which utilizes DevExtreme's remote query engine and `LoadOptions`.
- Document `<DatagridDXPagination />` usage, defaults, and the requirement for a known `total`.

---

## 9. Testing Strategy
- **`tests/DatagridDXPagination.test.tsx`**:
  - Scenario A: Context state mapping (`page` → `pageIndex`, `perPage` → `pageSize`, `total` → `itemCount`).
  - Scenario B: User page change calls `setPage(N)` once.
  - Scenario C: User page size change calls `setPerPage(size)` once (no redundant `setPage(1)`).
  - Scenario D: Native presentation props passthrough (`showInfo`, `showNavigationButtons`, etc.).
  - Scenario E: Adapter-owned props cannot be overridden by consumer props.
  - Scenario F: Graceful fallback when `total === undefined` (renders `null`).
  - Scenario G: DataGrid internal paging remains disabled (`paging={{ enabled: false }}`).
- **`tests/DatagridDX.test.tsx`**:
  - Scenario H: Initial ASC sort indicator rendered on matching column.
  - Scenario I: Initial DESC sort indicator rendered on matching column.
  - Scenario J: User selecting unsorted column calls `setSort({ field, order: 'ASC' })` once.
  - Scenario K: User clicking active sort column toggles to DESC.
  - Scenario L: External sort change in React-Admin updates DevExtreme column indicator without calling `setSort`.
  - Scenario M: Single-column constraint: only one column active at a time.
  - Scenario N: Non-sortable column (`allowSorting={false}`) does not trigger `setSort`.
  - Scenario O: Column without `dataField` does not trigger `setSort`.
  - Scenario P: Consumer `onOptionChanged` runs and receives original event.
  - Scenario Q: Feedback-loop prevention guard prevents infinite cycles.
  - Server-Order Invariant: Grid settles on server-provided order.
- **`tests/integration.test.tsx`**:
  - Full flow with `AdminContext` + `ListBase` + spy `dataProvider`: asserts exact `page`, `perPage`, and `sort` parameters sent to `dataProvider.getList()`.

---

## 10. Example Application Upgrade
In `examples/basic/App.tsx`:
- Expand sample records from 5 to 35 customers across multiple cities and countries.
- Update in-memory `dataProvider.getList()` to perform genuine dataset-wide sorting by `sort.field` and `sort.order`, slice by `page` and `perPage`, and return accurate `total`.
- Configure `<List>` with `pagination={<DatagridDXPagination />}` and initial `sort={{ field: 'name', order: 'ASC' }}`.
