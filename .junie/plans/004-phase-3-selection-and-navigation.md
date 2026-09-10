# Phase 3 Implementation Plan & Architecture — Managed Row Selection and Row Navigation

## 1. Architectural Baseline & Context
Phase 1 established `DatagridDX` as a managed React-Admin grid with `record.id` keying and disabled internal paging. Phase 2 delivered standalone `DatagridDXPagination` and bidirectional single-column server sorting with feedback protection.

Phase 3 expands `DatagridDX` with React-Admin controlled multi-row selection and declarative row-click navigation, strictly maintaining the core architectural boundary:
```text
React-Admin ListController
        ↓
   ListContext
        ↓
    DatagridDX
        ↓
DevExtreme DataGrid
```

### Architectural Ownership Boundaries
- **React-Admin owns**:
  - Source records (`data`);
  - Selected record IDs (`selectedIds`);
  - Selection mutation dispatcher (`onSelect`);
  - Server paging (`page`, `perPage`, `total`);
  - Single-column server sorting (`sort`, `setSort`);
  - Resource identity (`resource`);
  - Navigation semantics (`useRedirect`).
- **DevExtreme provides**:
  - Table and row presentation;
  - Selection checkbox columns and header select-all UI;
  - Native selection events (`onSelectionChanged`);
  - Native row-click events (`onRowClick`).

---

## 2. React-Admin Selection as Canonical Store
React-Admin's `ListContext` is the sole canonical source of truth for selections across the application. It is consumed by external bulk actions, filters, selection counters, and pagination.

`DatagridDX` **never creates a duplicate canonical React state** (such as `useState(selectedIds)`). Instead, DevExtreme's controlled `selectedRowKeys` is computed as a pure projection:
```text
React-Admin selectedIds
        ↓
Current-Page Record ID Set (currentPageIdSet)
        ↓
Intersection: currentPageSelectedKeys
        ↓
DevExtreme selectedRowKeys
```

---

## 3. Cross-Page Selection Architecture & Merging Strategy
### Problem Definition
In server-paged grids, `dataProvider.getList()` fetches one page at a time (e.g. 10 records). DevExtreme only holds the current page records in its local data source.
If React-Admin's full `selectedIds` (e.g. `[2, 15, 27]`) were passed directly to DevExtreme, DevExtreme would attempt to manage row keys that do not exist on the current page, causing state corruption or automatic clearing.
Conversely, when DevExtreme emits `onSelectionChanged` on the current page, replacing React-Admin's `selectedIds` with only the visible keys would drop selections made on other server pages.

### Current-Page Projection
`DatagridDX` derives:
```ts
const currentPageIdSet = useMemo(() => {
  const set = new Set<RecordType['id']>();
  if (data) {
    for (let i = 0; i < data.length; i++) {
      const record = data[i];
      if (record) {
        set.add(record.id);
      }
    }
  }
  return set;
}, [data]);

const currentPageSelectedKeys = useMemo(() => {
  if (!selection || !selectedIds || selectedIds.length === 0) {
    return DEFAULT_EMPTY_ARRAY;
  }
  return selectedIds.filter((id) => currentPageIdSet.has(id as RecordType['id']));
}, [selection, selectedIds, currentPageIdSet]);
```
DevExtreme receives `selectedRowKeys={selection ? currentPageSelectedKeys : undefined}`.

### Cross-Page Disjoint Merge
When DevExtreme emits `onSelectionChanged`:
```ts
const handleSelectionChanged = useCallback(
  (e: DataGridSelectionChangedEvent<RecordType>) => {
    if (selection && onSelect) {
      const currentSelectedIds = selectedIds ?? DEFAULT_EMPTY_ARRAY;
      const offPageSelection = currentSelectedIds.filter(
        (id) => !currentPageIdSet.has(id as RecordType['id'])
      );
      const newSelection = [...offPageSelection, ...(e.selectedRowKeys as (string | number)[])];

      if (!areIdentifierSetsEqual(currentSelectedIds, newSelection)) {
        onSelect(newSelection);
      }
    }

    onSelectionChanged?.(e);
  },
  [selection, onSelect, selectedIds, currentPageIdSet, onSelectionChanged]
);
```

### Concrete Cross-Page Trace
1. **Page 1**: Current page has `[1, 2, 3]`. User selects `2`. `onSelect([2])` is called.
2. **Page Navigation**: User navigates to Page 2 (`[4, 5, 6]`).
   - `selectedIds` remains `[2]`.
   - `currentPageIdSet` contains `{ 4, 5, 6 }`.
   - `currentPageSelectedKeys` evaluates to `[]`. DevExtreme displays zero checkmarks.
3. **Page 2 Selection**: User selects `5`.
   - `offPageSelection = [2]`.
   - `e.selectedRowKeys = [5]`.
   - Merged `newSelection = [2, 5]`.
   - `onSelect([2, 5])` is called.
4. **Return to Page 1**: User navigates back to Page 1 (`[1, 2, 3]`).
   - `currentPageSelectedKeys` evaluates to `[2]`.
   - DevExtreme displays row 2 visibly checked.
   - React-Admin `selectedIds` remains `[2, 5]`. Zero data loss occurs.

---

## 4. Select-All Bound to Current Page (`selectAllMode = 'page'`)
Because the grid contains only the current server-fetched slice, the DevExtreme header "Select All" checkbox is hardcoded to:
```ts
selectAllMode: 'page'
```
Selecting all selects all visible records on the current page while preserving off-page selections. It never fabricates unseen records from unfetched server pages.

---

## 5. Adapter-Owned vs Safe Consumer Selection Options
The adapter locks semantic options to guarantee compatibility with React-Admin:
- `mode: 'multiple'` (managed selection is always multiple selection, not single or radio selection).
- `deferred: false` (React-Admin requires explicit, concrete identifier lists, not deferred query filters).
- `selectAllMode: 'page'` (grid holds only current page data).

These properties are omitted from `DatagridDXProps`:
- `'selection'` (replaced with managed `selection?: boolean | DatagridDXSelectionOptions`);
- `'selectedRowKeys'` (managed by adapter);
- `'defaultSelectedRowKeys'` (omitted to prevent uncontrolled divergence);
- `'selectionFilter'` and `'defaultSelectionFilter'` (omitted to prevent filter-based uncontrolled selection).

Safe presentation options exposed in `DatagridDXSelectionOptions`:
```ts
export type DatagridDXSelectionOptions = Omit<
  DxGridSelection,
  'mode' | 'deferred' | 'selectAllMode'
>;
```
Permitted consumer options include `showCheckBoxesMode`, `allowSelectAll`, `sensitivity`, etc.

---

## 6. Feedback-Loop Protection & Type-Strict Set Comparison
Controlled props combined with two-way event synchronization can trigger infinite update loops if not strictly guarded.
`areIdentifierSetsEqual` performs order-independent set comparison with strict type equality:
```ts
export function areIdentifierSetsEqual(
  a?: readonly (string | number)[],
  b?: readonly (string | number)[]
): boolean {
  if (a === b) return true;
  const aLen = a ? a.length : 0;
  const bLen = b ? b.length : 0;
  if (aLen === 0 && bLen === 0) return true;
  if (!a || !b) return false;

  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}
```
- Distinguishes numeric `1` from string `'1'`.
- Ignores array ordering (e.g. `[2, 3]` equals `[3, 2]`).
- Bypasses `onSelect` when programmatic reflection updates DevExtreme.

---

## 7. Declarative Row-Click Navigation Architecture
### Public API
```ts
export type DatagridDXRowClick = 'edit' | 'show' | false;
```
Configured via:
```tsx
<DatagridDX<Customer> rowClick="edit">
```
Default: `undefined` / `false` (grids remain non-navigable by default).

### Implementation via `useRedirect` and Safe `NavigationBridge`
React-Admin's `useRedirect()` hook is used for all navigations:
```ts
redirect(rowClick, resource, record.id, record);
```
To support isolated unit tests or component testing outside of a React Router `<Router>` context, `DatagridDX` inspects `useInRouterContext()`. When inside a router context, a transparent `NavigationBridge` mounts `useRedirect()` and assigns it to a stable ref. When outside a router context, `useRedirect()` is not mounted, preventing `useNavigate() may be used only in the context of a <Router> component` runtime exceptions.

### Data Row Restriction
Row navigation is strictly restricted to data rows:
```ts
if (e.rowType !== 'data') {
  return;
}
```
Header clicks (which sort columns), group rows, footer rows, and detail rows never trigger navigation.

---

## 8. Interaction Isolation
Four primary user interactions operate independently:
1. **Checkbox click** (`.dx-select-checkbox`, `.dx-command-select`):
   - Toggles selection only.
   - The row-click handler explicitly checks event target and command columns:
     ```ts
     const target = e.event?.target as HTMLElement | null | undefined;
     if (
       target &&
       (target.closest?.('.dx-command-select') ||
         target.closest?.('.dx-select-checkbox') ||
         target.classList?.contains('dx-select-checkbox'))
     ) {
       return;
     }
     ```
   - Never triggers row navigation.
2. **Row click** (`.dx-data-row`):
   - Triggers `rowClick` redirect ('edit' or 'show').
   - Does not toggle row selection.
3. **Column header click**:
   - Triggers React-Admin single-column sorting.
   - Never triggers row navigation.
4. **Pagination click**:
   - Dispatches page/pageSize changes in `DatagridDXPagination`.
   - Never triggers row navigation or clears off-page selections.

---

## 9. Native Event Composition & Cancellation
- **`onSelectionChanged`**:
  - The adapter updates React-Admin selection first (if changed).
  - The consumer's `onSelectionChanged?.(e)` callback is invoked with the original DevExtreme event.
- **`onRowClick`**:
  - The consumer's `onRowClick?.(e)` callback is invoked first.
  - Consumers can set `e.handled = true` to cancel adapter navigation.
  - If `e.handled === true`, navigation immediately aborts.

---

## 10. Basic Example Updates
The `examples/basic` application was updated to demonstrate all Phase 3 capabilities:
- In-memory `update` mutation support added to the custom `dataProvider`.
- `CustomerEdit` implemented with `Edit`, `SimpleForm`, and `TextInput` components.
- `CustomerShow` implemented with `Show`, `SimpleShowLayout`, and `TextField` components.
- `SelectedCount` indicator consuming `useListContext` displays current selected count and IDs.
- `CustomerList` enables `selection` and `rowClick="edit"`.
- `App.tsx` registers `edit` and `show` views on `<Resource name="customers" />`.

---

## 11. Pagination Theme Verification
Phase 2 introduced CSS variable styling in `DatagridDXPagination`:
```ts
backgroundColor: 'var(--dx-component-color-bg, #fff)',
color: 'var(--dx-color-text, #333)',
```
Verification confirmed:
1. **DevExtreme Light Theme (`dx.light.css`)**:
   - `--dx-component-color-bg` resolves to `#fff`.
   - `--dx-color-text` resolves to `#333`.
2. **DevExtreme Dark Theme (`dx.dark.css`)**:
   - `--dx-component-color-bg` resolves to `#2a2a2a`.
   - `--dx-color-text` resolves to `#dedede`.
3. Pager styling is readable in both light and dark themes without inline style collisions.
4. The library continues to import zero theme CSS files directly.

---

## 12. Automated Test Suite Summary
All 36 existing tests from Phases 1 and 2 continue to pass without modification.
22 new tests were added covering Selection (Scenarios A through N) and Navigation (Scenarios O through W).
Total passing tests: **58**.

### Selection Scenarios (A – N)
- **Scenario A**: Selection disabled by default (`mode: 'none'`).
- **Scenario B**: Selection enabled (`mode: 'multiple'`, `selectAllMode: 'page'`).
- **Scenario C**: Projection of React-Admin `selectedIds` to DevExtreme `selectedRowKeys`.
- **Scenario D**: Filtering of off-page IDs from DevExtreme `selectedRowKeys`.
- **Scenario E**: DevExtreme selection merged with off-page IDs and propagated to `onSelect`.
- **Scenario F**: Current-page visible deselection preserves off-page selected IDs.
- **Scenario G**: External selection clearing reflects in DevExtreme without redundant `onSelect`.
- **Scenario H & I**: Feedback loop guard ignores array ordering (`[2, 3]` vs `[3, 2]`).
- **Scenario J**: String identifiers preserved without numeric coercion.
- **Scenario K**: Header "Select All" selects current-page records only and retains off-page IDs.
- **Scenario L**: Cross-page selection retention across real page navigation.
- **Scenario M**: Selection preservation when server sorting moves records off current page.
- **Scenario N**: Consumer `onSelectionChanged` callback receives native event.

### Navigation Scenarios (O – W)
- **Scenario O**: `rowClick="edit"` redirects to `/customers/:id`.
- **Scenario P**: `rowClick="show"` redirects to `/customers/:id/show`.
- **Scenario Q**: `rowClick={false}` produces no redirection.
- **Scenario R**: Default omitted `rowClick` produces no redirection.
- **Scenario S**: Navigation preserves string record identifiers.
- **Scenario T**: Non-data row clicks (headers, footers) do not navigate.
- **Scenario U**: Checkbox clicks toggle selection without triggering navigation.
- **Scenario V**: Consumer `onRowClick` executes alongside navigation.
- **Scenario W**: Consumer cancellation via `e.handled = true` prevents navigation.

---

## 13. Public Declaration & Bundle Inspection
- **Declarations**: `DatagridDXProps`, `DatagridDXSelectionOptions`, and `DatagridDXRowClick` exported cleanly with strict typings. Conflicting native props (`selection`, `selectedRowKeys`, `defaultSelectedRowKeys`, `selectionFilter`, `defaultSelectionFilter`) are omitted.
- **Externalization**: `react`, `react-dom`, `react-admin`, `devextreme`, `devextreme-react` remain externalized. Zero bundle footprint expansion for peer dependencies.
- **Bundle Size**: `dist/index.js` is 6.40 kB (2.40 kB gzipped).

---

## 14. Known Limitations
- `rowClick` callback/promise functions (e.g. `(id, resource, record) => 'edit'`) are not yet supported.
- Automatic resource edit/show capability detection (`canAccess`) is not implemented; `rowClick` must be explicitly specified as `'edit'`, `'show'`, or `false`.
- Per-row selectable predicate (`isRowSelectable`) is not yet supported.
- DevExtreme inline/batch editing is not implemented; grid remains read-only.

---

## 15. Roadmap & Bulk Actions Recommendation
### Analysis
React-Admin v5 places bulk action toolbars (`bulkActionButtons`) directly on grid components, floating above the header when `selectedIds.length > 0`. Because `DatagridDX` replaces `<Datagrid>`, React-Admin's default bulk action bar is not automatically rendered unless consumers explicitly render a custom toolbar or standard React-Admin bulk buttons.
However, `ListContext.selectedIds` is already fully populated and updated across pages, meaning external components can consume selected IDs immediately.

### Recommendation: **Option A — Proceed directly to Phase 4 (Managed Filtering and Grid UX)**
**Rationale**:
1. Phase 3 successfully bridges the authoritative selection state. Any React-Admin component or custom toolbar in the List hierarchy can already read `selectedIds` and execute bulk actions (`useDeleteMany`, `useUpdateMany`, custom actions).
2. Phase 4 (Filtering, SearchPanel, FilterRow, HeaderFilter) completes the core read-path data shaping features before tackling mutation UI.
3. A dedicated Phase 3B is unnecessary because bulk action UI is primarily presentation on top of the already functioning selection state bridge.
