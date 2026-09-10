# Phase 4A Implementation Plan & Architecture — Managed React-Admin Filtering with DevExtreme Filter Row

## 1. Architectural Baseline & Context
Phase 1 established `DatagridDX` as a managed React-Admin grid with `record.id` keying and disabled internal paging. Phase 2 delivered standalone `DatagridDXPagination` and bidirectional single-column server sorting with feedback protection. Phase 3 delivered cross-page row selection and declarative row-click navigation.

Phase 4A introduces **Managed React-Admin Filtering with DevExtreme Filter Row** while maintaining the fundamental architectural invariant:
```text
DevExtreme Filter Row
        ↓
DevExtreme filter expression
        ↓
ra-devextreme-grid translation (getRaFilters)
        ↓
React-Admin setFilters(..., ..., true)
        ↓
dataProvider.getList()
        ↓
server-filtered page
        ↓
ListContext.data
        ↓
DatagridDX
```

### Architectural Ownership Boundaries
- **React-Admin owns**:
  - Source records (`data`);
  - Authoritative filter query state (`filterValues`);
  - Filter mutation dispatcher (`setFilters`);
  - Automatic page reset to 1 on filter changes;
  - Server paging (`page`, `perPage`, `total`);
  - Single-column server sorting (`sort`, `setSort`);
  - Cross-page row selections (`selectedIds`, `onSelect`);
  - Row navigation (`useRedirect`).
- **DevExtreme provides**:
  - Native Filter Row UI and operation chooser dropdown;
  - Native filter expression generation and option changes (`filterValue`);
  - In-place row filtering inputs and reset icons.

---

## 2. Public Filtering API
Managed filtering is opt-in via the `filtering` prop on `DatagridDX`:
- `filtering={false}` or `undefined`: Managed Filter Row is disabled (`filterRow.visible = false`).
- `filtering={true}`: Filter Row is enabled with sensible defaults:
  - `visible: true`
  - `showOperationChooser: true`
  - `applyFilter: 'auto'`
- `filtering={{ ... }}`: Filter Row is enabled with custom presentation options matching `DatagridDXFilterRowOptions` (which derives from DevExtreme `FilterRow` options, omitting `visible`).

```tsx
<DatagridDX<Customer>
  filtering
  selection
  rowClick="edit"
>
  <Column dataField="name" caption="Customer Name" />
</DatagridDX>
```

### Adapter-Owned DevExtreme Filtering Props
To prevent bypassing React-Admin list management and accidentally executing current-page client-only filtering, the following native props are omitted from `DatagridDXProps`:
- `filterRow`: Configured exclusively by the `filtering` prop.
- `filterValue`, `defaultFilterValue`: Managed by bidirectional synchronization with React-Admin `filterValues`.
- `filterSyncEnabled`: Controlled by the adapter (`filterSyncEnabled: true` when `filtering` is truthy).
- `headerFilter`: Disabled. In managed mode, DevExtreme only holds the current page array, so a Header Filter would only display values from the visible page, presenting a false representation of the dataset.
- `filterPanel`, `filterBuilder`, `filterBuilderPopup`, `searchPanel`: Omitted in managed mode to prevent complex expressions unsupported by React-Admin flat query objects.

---

## 3. Translation Layer & Default Filter Conventions

### Expression Structure Mismatch
React-Admin manages flat query objects (e.g. `{ name_q: 'smith', active_eq: true }`), while DevExtreme uses structured nested array expressions (e.g. `[['name', 'contains', 'smith'], 'and', ['active', '=', true]]`).

### Supported Operators Mapping
| DevExtreme Operator | React-Admin Suffix | Example DevExtreme Expression | Example React-Admin Query |
| :--- | :--- | :--- | :--- |
| `=` | `_eq` | `['country', '=', 'UK']` | `{ country_eq: 'UK' }` |
| `<>` | `_neq` | `['status', '<>', 'inactive']` | `{ status_neq: 'inactive' }` |
| `>` | `_gt` | `['age', '>', 18]` | `{ age_gt: 18 }` |
| `>=` | `_gte` | `['age', '>=', 18]` | `{ age_gte: 18 }` |
| `<` | `_lt` | `['price', '<', 100]` | `{ price_lt: 100 }` |
| `<=` | `_lte` | `['price', '<=', 100]` | `{ price_lte: 100 }` |
| `contains` | `_q` | `['name', 'contains', 'smith']` | `{ name_q: 'smith' }` |
| `between` | `_gte` + `_lte` | `['price', 'between', [10, 50]]` | `{ price_gte: 10, price_lte: 50 }` |
| `=` (null) | `_eq` | `['status', '=', null]` | `{ status_eq: null }` |

### Suffix Parsing with Underscore Support
Columns in production systems frequently contain underscores (e.g. `company_name`, `created_at`, `user_account_id`).
Naive splitting (`key.split('_')[0]`) breaks these field names. The adapter uses regular expression anchoring strictly from the end of the string:
```ts
const match = /^(.*)_(eq|neq|gt|gte|lt|lte|q)$/.exec(key);
```
This guarantees `company_name_q` correctly parses to field `company_name` and operator `contains`, and `created_at_gte` parses to field `created_at` and operator `>=`.

### Reverse Conversion (React-Admin → DevExtreme)
- Recognizes known suffixes and maps them back to DevExtreme operators.
- Plain keys matching valid grid columns (e.g. `{ country: 'UK' }`) map to equality: `['country', '=', 'UK']`.
- Range pairs (`field_gte` + `field_lte`) are consolidated into a single DevExtreme `between` expression: `['field', 'between', [min, max]]`.
- Keys not matching any grid column are ignored when building the DevExtreme filter expression.

### Custom Conversion Escape Hatches
For applications requiring custom backend query syntaxes (such as Django/FastAPI double-underscore syntax `name__icontains` or nested filter objects), `DatagridDX` provides custom converter callbacks:
- `getRaFilters(dxFilter, context)`: Translates DevExtreme filter expression to React-Admin filter object.
- `getDxFilterValue(raFilters, context)`: Translates React-Admin filter object to DevExtreme filter expression.

---

## 4. Unrelated Filter Preservation & Multi-Filter Merging
React-Admin applications often have global search inputs (`q`), custom toggle buttons, or backend flags outside the grid.
The adapter guarantees that modifying or clearing a DataGrid Filter Row never deletes or corrupts unrelated React-Admin filters:
1. `getManagedColumnFields` inspects grid columns (via `columns` prop and JSX `<Column>` children) and identifies active columns with string `dataField` and `allowFiltering !== false`.
2. When the user edits or clears a Filter Row column, `mergeRaFilters` retains all keys in `previousFilters` whose field does NOT belong to an active grid column.
3. Only keys belonging to managed grid columns are updated or removed.

---

## 5. Bidirectional Synchronization & Feedback-Loop Guard
Bidirectional synchronization between React-Admin `filterValues` and DevExtreme `filterValue` presents a risk of recursive ping-pong render loops.
The adapter eliminates loops via a two-layer guard:
1. **Semantic Deep Equality (`isFilterValueEqual`)**: Compares DevExtreme nested filter arrays, primitives, null/undefined, empty arrays, and Dates. Programmatic updates are skipped if the incoming filter expression is structurally equal to the existing state.
2. **Synchronization Lock (`isFilteringSyncingRef`)**: While programmatic updates from React-Admin are being applied to the grid instance, `isFilteringSyncingRef.current = true`. The `handleOptionChanged` listener detects this lock and ignores the event, preventing redundant calls to `setFilters`.

---

## 6. Debouncing & Lifecycle Integration
- **Debounced Dispatching**: Grid filter changes invoke `setFilters(nextRaFilters, displayedFilters, true)`. The third argument (`true`) activates React-Admin v5's debounced dispatch, preventing excessive HTTP requests while typing.
- **Automatic Page Reset**: When filters change, React-Admin's list controller automatically resets `page` to 1. The adapter deliberately does not call `setPage(1)`.
- **Single Network Request Owner**: React-Admin remains the sole fetch owner. DevExtreme issues zero auxiliary network requests.

---

## 7. Client-Side Filter Reapplication Investigation (Section 27 Findings)
DevExtreme DataGrid was investigated in detail when operating with an in-memory array `dataSource={data}`:
1. **Local Filtering Invariant**: When bound to an in-memory array, DevExtreme DataGrid **always evaluates its filter expression locally** on the records present in the array, even if `remoteOperations={{ filtering: true }}` is configured.
2. **Consequence**: When React-Admin returns server-filtered page records, DevExtreme reapplies the filter expression to the returned records.
3. **Requirement**: The backend server's filtering semantics must correspond to the DevExtreme Filter Row operations configured on the column. If server semantics differ (e.g. server matches substring case-sensitively while DevExtreme expects case-insensitive), DevExtreme would locally hide the server-returned records.
4. **Loading Mask**: React-Admin's fetch cycle activates DevExtreme's native loading overlay (`beginCustomLoading`), cleanly concealing transient state transitions until server-filtered records arrive.

---

## 8. Coexistence with Grid Features
- **Sorting**: Column sorting updates `sort` in `ListContext` while leaving `filterValues` intact. Conversely, filtering updates `filterValues` while preserving `sort`.
- **Selection**: DevExtreme receives only current-page selected records as `selectedRowKeys`. Records selected on previous pages or filtered out of the visible page remain safely in React-Admin's `selectedIds` store.
- **Navigation**: Row clicks on Filter Row cells (`rowType === 'filter'`) are strictly excluded from triggering `rowClick` navigation.
- **Consumer Callbacks**: Consumer `onOptionChanged` handlers are called exactly once per option change.

---

## 9. Unsupported DevExtreme Filtering Operations
The default managed converter does NOT support:
- Arbitrary `OR` boolean logic.
- `NOT` boolean expressions (`['!', ...]`).
- Custom filter functions or script selectors.
- Operators outside `=, <>, >, >=, <, <=, contains, between`.

When an unsupported operator or boolean structure is encountered:
- The adapter logs a development-time console warning (`[ra-devextreme-grid] Unsupported ...`).
- The invalid condition is omitted from the resulting query rather than corrupting the query.
- The application does not crash.
- Full arbitrary filter logic will be natively supported in Phase 5 via `DatagridDXRemote`.
