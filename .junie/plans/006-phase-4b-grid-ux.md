# Phase 4B Implementation Plan & Architecture — Managed Grid UX

## 1. Architectural Baseline & Context

Phase 4A established managed React-Admin filtering using DevExtreme's Filter Row alongside managed single-column sorting, multi-row cross-page selection, server pagination, and row-click navigation.

Phase 4B addresses **safe client-side presentation and column-management UX**:
- Column Chooser
- Column Resizing
- Column Reordering
- Column Fixing / Pinning
- Adaptive Column Hiding / Responsive Behavior

The core architectural invariant governing Phase 4B is:
> **React-Admin owns list/query state. DevExtreme may own purely visual column state.**

### Architectural Ownership Matrix

| Feature / State Domain | Owner | Mutates Server Query? | Persisted Across Sessions? |
| :--- | :--- | :--- | :--- |
| Records (`data`) | React-Admin (`ListContext`) | N/A (Server Source) | N/A |
| Pagination (`page`, `perPage`, `total`) | React-Admin (`ListContext`) | Yes | No (managed by RA URL/store) |
| Sorting (`sort: { field, order }`) | React-Admin (`ListContext`) | Yes | No (managed by RA URL/store) |
| Filtering (`filterValues`) | React-Admin (`ListContext`) | Yes | No (managed by RA URL/store) |
| Selection (`selectedIds`) | React-Admin (`ListContext`) | No | No (managed by RA store) |
| Row Navigation (`rowClick`) | React-Admin (`useRedirect`) | N/A | N/A |
| Column Visibility (`column.visible`) | DevExtreme (Presentation) | **No** | No (Phase 9) |
| Column Width (`column.width`) | DevExtreme (Presentation) | **No** | No (Phase 9) |
| Column Position (`visibleIndex`) | DevExtreme (Presentation) | **No** | No (Phase 9) |
| Column Fixing (`column.fixed`) | DevExtreme (Presentation) | **No** | No (Phase 9) |
| Adaptive Hiding (`hidingPriority`) | DevExtreme (Presentation) | **No** | No (Phase 9) |

---

## 2. Public API Surface & Native Passthrough Philosophy

### Design Decision: No Artificial `gridUx` Wrapper
We do **not** introduce an adapter abstraction such as `<DatagridDX gridUx={{ ... }} />`.
- DevExtreme DataGrid already exposes mature, strongly typed props for column presentation:
  `columnChooser`, `allowColumnResizing`, `columnResizingMode`, `columnMinWidth`, `columnAutoWidth`, `allowColumnReordering`, `columnFixing`, `columnHidingEnabled`.
- These features are strictly client-side presentation concerns; they require zero translation into React-Admin `ListContext` queries.
- Exposing native DevExtreme props directly preserves documentation parity, avoids adapter maintenance overhead, and maintains idiomatic DevExtreme React usage:

```tsx
<DatagridDX<Customer>
  filtering
  selection
  rowClick="edit"
  allowColumnResizing
  allowColumnReordering
  columnAutoWidth
  columnChooser={{
    enabled: true,
    mode: 'select',
    search: { enabled: true },
  }}
  columnFixing={{
    enabled: true,
  }}
  columnHidingEnabled
>
  <Column dataField="id" allowHiding={false} fixed />
  <Column dataField="name" caption="Name" hidingPriority={2} />
  <Column dataField="company" caption="Company" hidingPriority={1} />
</DatagridDX>
```

### TypeScript Public Prop Surface & API Hardening

`DatagridDXProps` in `src/types.ts` is defined via `Omit<IDataGridOptions<RecordType, RecordType['id']>, ...>`.
To prevent consumers from accidentally configuring features that conflict with React-Admin ownership, the following props are strictly omitted from `DatagridDXProps`:
- `stateStoring`: **Omitted in Phase 4B**. DevExtreme `stateStoring` persists `filterValue`, `selectedRowKeys`, `pageIndex`, `pageSize`, etc. Enabling native `stateStoring` in managed mode creates two competing state owners. Visual state persistence is deferred to Phase 9.
- `remoteOperations`: **Omitted**. Consumers cannot configure conflicting remote modes. Managed mode uses local array presentation. (True remote operations belong to Phase 5 `DatagridDXRemote`).
- `filterRow`, `filterValue`, `defaultFilterValue`, `filterSyncEnabled`: Controlled by adapter filtering hook.
- `headerFilter`, `filterPanel`, `filterBuilder`, `filterBuilderPopup`, `searchPanel`: Omitted due to query mismatch or incomplete current-page dataset in managed mode.
- `selection`, `selectedRowKeys`, `defaultSelectedRowKeys`, `selectionFilter`, `defaultSelectionFilter`: Controlled by adapter selection hook.
- `paging`, `pager`: Controlled by adapter pagination hook and `DatagridDXPagination`.
- `sorting`: Controlled by adapter sorting hook.
- `dataSource`, `keyExpr`: Bound directly to React-Admin `data` and `record.id`.

---

## 3. Native DataGrid Prop Surface Audit

A formal audit of inherited `IDataGridOptions` in managed mode yields three categories:

| Feature / Prop | Classification | Decision | Justification |
| :--- | :--- | :--- | :--- |
| `columnChooser` | Safe visual passthrough | Supported natively | Affects only local column visibility; no query mutation |
| `allowColumnResizing` | Safe visual passthrough | Supported natively | Affects only local column width; no query mutation |
| `columnResizingMode` | Safe visual passthrough | Supported natively | Safe visual mode (`'nextColumn'` \| `'widget'`) |
| `columnMinWidth` | Safe visual passthrough | Supported natively | Layout constraint only |
| `columnAutoWidth` | Safe visual passthrough | Supported natively | Safe layout calculation |
| `allowColumnReordering` | Safe visual passthrough | Supported natively | Affects only local column order (`visibleIndex`); no query mutation |
| `columnFixing` | Safe visual passthrough | Supported natively | Affects only local column pinning; works cleanly alongside selection |
| `columnHidingEnabled` | Safe visual passthrough | Supported natively | Responsive column collapse; guarded against row navigation |
| `stateStoring` | Adapter-owned / conflicting | **Omitted** | Persists filter, selection, and page state owned by React-Admin |
| `remoteOperations` | Adapter-owned / conflicting | **Omitted** | Prevents hybrid configuration; array mode handles current page |
| `searchPanel` | Potentially misleading / conflicting | Kept omitted | Array-only search; global dataset search belongs in React-Admin UI |
| `headerFilter` | Potentially misleading / conflicting | Kept omitted | Generates distinct items from visible page only, misleading users |
| `filterBuilder`, `filterPanel` | Potentially misleading / conflicting | Kept omitted | Produces nested boolean queries that cannot map to flat RA query |
| `grouping`, `groupPanel` | Potentially misleading | Documented unsupported | Managed grid only has current page; grouping groups only current page slice |
| `summary` | Potentially misleading | Documented unsupported | Calculates aggregations only over current page slice, not whole dataset |
| `editing` | Potentially misleading | Documented unsupported | Deferred to Phase 10; requires React-Admin mutation bridge |
| `rowDragging` | Potentially misleading | Documented unsupported | Reordering records without backend sequence persistence is invalid |

---

## 4. Phase 4A `remoteOperations` Cleanup

In Phase 4A, `useManagedFiltering` returned:
```ts
remoteOperations: filtering ? ({ filtering: true } as const) : undefined
```
and `<DataGrid>` passed `remoteOperations={remoteOperations}`.

### Technical Analysis & Decision
1. **Local Evaluation Invariant**: When DevExtreme DataGrid receives an in-memory array `dataSource={data}`, it evaluates its filter expression locally over the provided array regardless of `remoteOperations.filtering`.
2. **No Behavioral Benefit**: The flag did not prevent DevExtreme from evaluating `filterValue`, nor did it delegate execution to a DevExtreme remote store.
3. **Misleading Contract**: The configuration suggested DevExtreme had offloaded filtering, which was untrue and architecturally confusing.
4. **Resolution**: Remove internal `remoteOperations: { filtering: true }` from `useManagedFiltering.ts` and `<DataGrid remoteOperations={remoteOperations}>` in `DatagridDX.tsx`. Managed filtering operates cleanly with React-Admin filtering the dataset and DevExtreme reapplying `filterValue` to the returned page records. Retain `remoteOperations` as omitted from public `DatagridDXProps`.

---

## 5. Interaction Semantics & Isolation

### 5.1 Column Chooser & Visibility Interaction
- **Search within Column Chooser**: Distinguishable from DataGrid `searchPanel`. Column Chooser search (`columnChooser.search.enabled = true`) only filters column titles within the chooser popover, making it completely safe.
- **Query Isolation**: Toggling column visibility via `instance.columnOption(column, 'visible', false)` emits `onOptionChanged` for `columns[n].visible`. This must not invoke `setFilters`, `setSort`, `setPage`, or `onSelect`.
- **Hidden Filtered Columns**: React-Admin `filterValues` is authoritative. When column `country` is filtered to `"UK"` and the user hides the column, React-Admin's `country_q="UK"` filter remains active in the server query. When the column is shown again, the Filter Row editor correctly displays `"UK"`.
- **Hidden Sorted Columns**: When column `company` is sorted ASC and hidden, React-Admin's sort remains `{ field: 'company', order: 'ASC' }`. When shown again, the ascending sort indicator is restored.
- **Protected Columns**: Setting `allowHiding={false}` on a `<Column>` prevents that column from being hidden in the Column Chooser.

### 5.2 Resizing and Reordering Interaction
- Column width changes (`columns[n].width`) and reordering (`columns[n].visibleIndex`) fire `onOptionChanged`.
- `handleOptionChanged` in `DatagridDX.tsx` checks strictly:
  - `e.name === 'filterValue'` for filter synchronization.
  - `e.name === 'columns' && e.fullName.endsWith('.sortOrder')` for sort synchronization.
- All visual property changes bypass React-Admin handlers completely and propagate cleanly to consumer `onOptionChanged`.

### 5.3 Column Fixing & Selection Coexistence
- Runtime fixing via column header menu (`columnFixing={{ enabled: true }}`) and static fixing (`fixed`, `fixedPosition="left" | "right"`) only affect horizontal scrolling layout.
- DevExtreme positions fixed columns in sticky containers (`.dx-datagrid-rowsview .dx-col-fixed`).
- Managed multi-row selection column (`.dx-command-select`) coexists without interfering with fixed data columns or selection tracking (`selectedIds`).

### 5.4 Adaptive Column Hiding & Navigation Guard
- Responsive layout via `columnHidingEnabled={true}` hides lower `hidingPriority` columns on narrow viewports and renders:
  - An adaptive command button column (`.dx-command-adaptive`, `.dx-datagrid-adaptive-more`) with an expand/collapse chevron.
  - An adaptive detail row (`rowType === 'detailAdaptive'`, `.dx-adaptive-detail-row`).
- **Navigation Guard**: In `DatagridDX.tsx`, `handleRowClick` must not redirect when clicking adaptive controls.
  - `e.rowType !== 'data'` guards detail rows (`detailAdaptive`).
  - Target check inspects `e.event?.target` and its parent hierarchy for `.dx-command-adaptive`, `.dx-adaptive-detail-row`, or `.dx-datagrid-adaptive-more`, terminating `handleRowClick` before calling `redirect()`.
- **Consumer Callback**: `onAdaptiveDetailRowPreparing` passes through natively, allowing consumers to customize adaptive detail content.

---

## 6. Testing Strategy & Validation Matrix

Unit and integration tests are executed via Vitest and `@testing-library/react` in jsdom:

### Scenarios Matrix
- **Scenario A**: Column Chooser disabled by default (`columnChooser.enabled === false`).
- **Scenario B**: Column Chooser enabled (`columnChooser={{ enabled: true }}`).
- **Scenario C**: Column Chooser search & mode configuration preserved.
- **Scenario D**: Column visibility changes trigger zero React-Admin query mutations.
- **Scenario E**: Hidden filtered column retains filter in React-Admin and restores Filter Row UI when shown.
- **Scenario F**: Hidden sorted column retains sort in React-Admin and restores sort indicator when shown.
- **Scenario G**: Column with `allowHiding={false}` is preserved on column instance.
- **Scenario H**: Column resizing enabled (`allowColumnResizing={true}`).
- **Scenario I**: Column width change triggers zero React-Admin query mutations.
- **Scenario J**: Column reordering enabled (`allowColumnReordering={true}`).
- **Scenario K**: Column reordering triggers zero React-Admin query mutations.
- **Scenario L**: Consumer `onOptionChanged` receives width and visibleIndex events once.
- **Scenario M**: Column fixing enabled (`columnFixing={{ enabled: true }}`).
- **Scenario N**: Per-column fixing (`fixed`, `fixedPosition`) configured on column instance.
- **Scenario O**: Column fixing changes trigger zero React-Admin query mutations.
- **Scenario P**: Selection checkboxes and selection tracking work seamlessly with column fixing.
- **Scenario Q**: Adaptive column hiding enabled (`columnHidingEnabled={true}`).
- **Scenario R**: Column `hidingPriority` preserved on column instance.
- **Scenario S**: Clicking adaptive command expand/collapse button does not navigate when `rowClick="edit"`.
- **Scenario T**: Clicking within adaptive detail row does not navigate when `rowClick="edit"`.
- **Scenario U**: Consumer `onAdaptiveDetailRowPreparing` callback receives event.
- **Scenario V**: Type test verifies `stateStoring` is rejected by TypeScript compiler.
- **Scenario W**: Composite sequence of resize, reorder, hide, and fix produces zero React-Admin dispatches.
- **Scenario X**: Regression verification that managed filtering operates without `remoteOperations.filtering`.

---

## 7. Documentation & Example Application Updates

1. **`examples/basic/App.tsx`**:
   - Showcase `allowColumnResizing`, `allowColumnReordering`, `columnAutoWidth`, `columnChooser` (select mode + search), `columnFixing`, and `columnHidingEnabled`.
   - Configure ID column with `allowHiding={false}` and `fixed`.
   - Assign distributed `hidingPriority` values across remaining columns.
2. **`README.md`**:
   - Update Phase 4B status to complete.
   - Clarify roadmap: Phase 4B is Managed Grid UX (presentation only), Phase 9 is Grid State Persistence.
   - Document safe visual options and explicitly explain the omission of `stateStoring`.
   - Document unsupported features in managed mode (Header Filter, Search Panel, Filter Builder, grouping, summaries, inline editing).
