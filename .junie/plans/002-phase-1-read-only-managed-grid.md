# Phase 1 Implementation Plan — Read-Only Managed Grid

## 1. Current Repository State & Baseline
- **Repository**: `https://github.com/pjcunningham/ra-devextreme-grid`
- **Current Version**: `0.0.0`
- **Phase 0 Status**: Scaffolding complete with single-package build, DevExtreme React 26.1 and React-Admin 5.15 dependencies, basic unit tests running under Vitest/jsdom, and a standalone demo in `examples/basic`.
- **Existing `DatagridDX` API**: The Phase 0 implementation accepts standalone `data?: TRow[]` or `dataSource?: IDataGridOptions['dataSource']` and optional `keyExpr`. It does not consume any React-Admin hooks or contexts.
- **Goal of Phase 1**: Transition `DatagridDX` to a genuine React-Admin managed grid component placed within `<List>`, reading from React-Admin's `ListContext`, eliminating standalone data props, enforcing canonical `record.id` row keys, and guarding against client-side paging and interactive sorting until Phase 2.

## 2. Proposed `DatagridDX` Public API

### Primary Usage Contract
```tsx
import { List } from 'react-admin';
import { Column } from 'devextreme-react/data-grid';
import { DatagridDX } from 'ra-devextreme-grid';

export const CustomerList = () => (
  <List>
    <DatagridDX<Customer>>
      <Column dataField="id" caption="ID" />
      <Column dataField="name" caption="Customer Name" />
      <Column dataField="email" caption="Email Address" />
    </DatagridDX>
  </List>
);
```

### TypeScript Prop Interface
In `src/types.ts`:
```ts
import type { IDataGridOptions } from 'devextreme-react/data-grid';
import type { RaRecord } from 'react-admin';

export type DatagridDXProps<RecordType extends RaRecord = RaRecord> =
  Omit<IDataGridOptions<RecordType, RecordType['id']>, 'dataSource' | 'keyExpr'>;
```

### Public Exports
In `src/index.ts`:
```ts
export { DatagridDX } from './DatagridDX';
export type { DatagridDXProps } from './types';
```
Provisional Phase 0 props `data`, `dataSource`, and public `keyExpr` are removed completely. There is no dual standalone/managed mode.

## 3. React-Admin `ListContext` Integration Approach
- Single Data Owner: React-Admin's `ListController` owns all data querying via `dataProvider.getList()`.
- Data Flow:
  ```text
  React-Admin ListController
          ↓
     ListContext (data, isPending, isFetching)
          ↓
      DatagridDX
          ↓
  DevExtreme DataGrid (dataSource=data, keyExpr="id")
  ```
- Component consumes `const { data, isPending, isFetching } = useListContext<RecordType>()`.
- Under no circumstances does `DatagridDX` call `dataProvider` or `getList()` directly.
- The `data` array is passed directly to DevExtreme `dataSource={data ?? DEFAULT_EMPTY_ARRAY}` without duplication in local `useState` or unnecessary record cloning.

## 4. Record Typing
- Generic parameter: `<RecordType extends RaRecord = RaRecord>`.
- React-Admin defines `RaRecord<Identifier = any> { id: Identifier; [key: string]: any; }`, where `Identifier` is `string | number`.
- Row key type is `RecordType['id']`, supporting both string identifiers (e.g. `'cust-001'`) and numeric identifiers (e.g. `42`).
- Public types avoid falling back to `any` while cleanly integrating with DevExtreme's `IDataGridOptions<RecordType, RecordType['id']>`.

## 5. Record-Key Handling
- Canonical Identity: In React-Admin, `record.id` is the invariant identifier for all entities.
- Hardcoded Key Expression: DevExtreme `keyExpr="id"` is bound internally and omitted from `DatagridDXProps`.
- Consumers cannot override `keyExpr` with a conflicting attribute name, ensuring zero desynchronization between React-Admin and DevExtreme selection/mutation models.

## 6. Loading-State Handling
- Initial Pending State (`data === undefined && isPending === true`):
  - The grid must not throw when `data` is undefined (safe fallback to a module-level constant empty array `DEFAULT_EMPTY_ARRAY = []`).
  - DevExtreme's loading indicator is activated via `innerRef.current?.instance().beginCustomLoading()`.
  - Misleading empty-state text is prevented by setting `noDataText={isPending ? '' : (props.noDataText ?? 'No data')}`.
- Background Refetching (`data` exists and `isFetching === true`):
  - Existing records remain rendered and visible in the grid.
  - Custom loading is displayed via `beginCustomLoading()` without unmounting or resetting rows.
  - When loading finishes (`!isPending && !isFetching`), `endCustomLoading()` is called.

## 7. Empty-State Behaviour
- Loaded Empty Result (`data = [] && isPending === false`):
  - The grid renders cleanly without errors.
  - Native DevExtreme `noDataText` is displayed (defaulting to DevExtreme's built-in message or custom `noDataText` passed via props).
- React-Admin Empty Page: React-Admin `<List>` can render an empty view before rendering its children for resources with 0 total records. If the child `DatagridDX` is rendered, it handles empty arrays safely.

## 8. DevExtreme Data-Shaping Safeguards
In Phase 1, React-Admin supplies a specific server-ordered and paginated subset of records. To prevent DevExtreme from independently slicing or sorting this page locally:
- Paging Disabled: `paging={{ enabled: false }}` is forced unconditionally.
- Interactive Sorting Disabled: `sorting={{ mode: 'none' }}` is forced unconditionally.
- Precedence: Adapter-owned safeguards override any consumer-passed `paging` or `sorting` props.

## 9. Test Architecture & Changes
- Public context fixtures: Tests wrap `DatagridDX` in real React-Admin `ListContextProvider` instances rather than mocking `useListContext`.
- Integration tests:
  - Scenario A: Context records rendered into DevExtreme DataGrid rows.
  - Scenario B: Generic typed records extending `RaRecord`.
  - Scenario C: String identifier records (`id: 'cust-abc'`).
  - Scenario D: Initial pending state (`data = undefined`, `isPending = true`) suppresses "No data" text and triggers loading UI.
  - Scenario E: Loaded empty data (`data = []`, `isPending = false`) displays `noDataText`.
  - Scenario F: Background refetch (`isFetching = true`) preserves existing rows.
  - Scenario G: Native props passthrough (`showBorders`, etc.).
  - Scenario H: Child `<Column>` projection.
  - Scenario I: Single data fetch owner verification (React-Admin `ListController` triggers 1 `getList()`, `DatagridDX` triggers 0).
  - Scenario J: Data-shaping safeguards verification (`paging.enabled === false`, `sorting.mode === 'none'`).
- JSDOM Custom Elements Teardown: Retain the isolated license custom element cleanup workaround in `tests/setup.ts`.

## 10. Example Application Changes
- Update `examples/basic/src/App.tsx` to mount a full React-Admin application using `<Admin>` and `<Resource>` or `<List>` with an in-memory `dataProvider`.
- Showcase typed columns (`<Column dataField="id" />`, `<Column dataField="name" />`, `<Column dataField="email" />`).
- Application imports `devextreme/dist/css/dx.light.css`.
- Library remains free of CSS bundling.

## 11. README Updates
- Replace Phase 0 standalone code snippet with `<List><DatagridDX>...</DatagridDX></List>`.
- Document managed architecture, `record.id` keying, and read-only Phase 1 status.
- Update roadmap showing Phase 1 complete and Phase 2 pending.

## 12. Peer Dependencies Review
- Current `package.json` specifies `"devextreme": "^24.0.0 || ^25.0.0 || ^26.0.0"` and `"devextreme-react": "^24.0.0 || ^25.0.0 || ^26.0.0"`.
- Tested runtime in repository: `26.1.4`.
- Decision: Tighten peer dependencies to `"devextreme": "^26.1.0"` and `"devextreme-react": "^26.1.0"`.
- Rationale: DevExtreme releases breaking major versions biannually. Without a multi-version test suite across versions 24 and 25, claiming multi-major compatibility contradicts the PRD rule: "Peer dependency ranges should only be widened when tested."
- React (`^18.0.0 || ^19.0.0`) and React-Admin (`^5.0.0`) peer ranges are retained as officially supported and tested.

## 13. Risks, Uncertainties & Mitigations
- **Risk**: DevExtreme instance not yet initialized when effect calls `beginCustomLoading()`.
  *Mitigation*: Guard with `const grid = innerRef.current?.instance(); if (!grid) return;`. The effect re-runs after mount, and `noDataText` dynamic calculation prevents UI flash during the initial synchronous render.
- **Risk**: Stale empty array reference causing unnecessary renders.
  *Mitigation*: Use module-level `DEFAULT_EMPTY_ARRAY = []` fallback.
- **Risk**: Prop spread overwriting adapter safeguards.
  *Mitigation*: Destructure `paging` and `sorting` from `props` and place adapter safeguards after `...restProps`.

---

# Phase 1 Final Report

## Implementation summary
Phase 1 transitioned `DatagridDX` from the Phase 0 proof-of-installation standalone component into the first genuine React-Admin managed grid integration:
- Integrated with React-Admin `useListContext<RecordType>()` as the sole source of record state.
- Removed provisional Phase 0 `data`, `dataSource`, and public `keyExpr` props from `DatagridDXProps`.
- Configured DevExtreme DataGrid row key expression permanently to canonical `record.id`.
- Implemented clean loading lifecycle via `beginCustomLoading()` / `endCustomLoading()` and dynamic `noDataText` suppression (`isPending ? '' : ...`).
- Enforced data-shaping safeguards by unconditionally disabling DevExtreme paging (`paging={{ enabled: false }}`) and sorting (`sorting={{ mode: 'none' }}`).
- Updated the example application to a functional React-Admin `<Admin>` + `<Resource>` + `<List>` app with an in-memory data provider.
- Tightened DevExtreme peer dependencies to tested `^26.1.0`.

## Repository structure changes
- Added `.junie/plans/002-phase-1-read-only-managed-grid.md`.
- Modified `src/DatagridDX.tsx`, `src/types.ts`, `package.json`, `README.md`, `eslint.config.js`, `examples/basic/App.tsx`, `tests/DatagridDX.test.tsx`, `tests/index.test.ts`.

## React-Admin integration
- Hooks used: `useListContext<RecordType>()` from `react-admin`.
- Records are passed to DevExtreme via `dataSource={data ?? DEFAULT_EMPTY_ARRAY}`.
- Single owner: React-Admin owns data fetching. `DatagridDX` never calls `dataProvider.getList()`.

## `DatagridDX` public API
- Usage: `<List><DatagridDX<RecordType>><Column dataField="..." /></DatagridDX></List>`.
- Type shape: `DatagridDXProps<RecordType extends RaRecord = RaRecord> = Omit<IDataGridOptions<RecordType, RecordType['id']>, 'dataSource' | 'keyExpr'>`.
- Standalone props `data`, `dataSource`, and `keyExpr` are removed completely.

## Record identity
- Bound internally to canonical `record.id` via `keyExpr="id"`.
- Verified support for both numeric IDs and string IDs (`cust-alpha`).

## Loading behaviour
- Initial pending: DevExtreme `beginCustomLoading('')` called and `noDataText` suppressed to `''`.
- Background fetching: Existing rows remain rendered and visible while `beginCustomLoading('')` is displayed.
- Loaded empty data: Displays configured `noDataText` (or defaults to `'No data'`).

## DevExtreme data-shaping safeguards
- `paging={{ enabled: false }}` and `sorting={{ mode: 'none' }}` win over consumer props.

## Peer dependency review
- `devextreme`: `^26.1.0` (tightened from `^24 || ^25 || ^26` to reflect tested runtime).
- `devextreme-react`: `^26.1.0`.
- `react`, `react-dom`: `^18.0.0 || ^19.0.0`.
- `react-admin`: `^5.0.0`.

## Files changed
- `src/types.ts`, `src/DatagridDX.tsx`, `package.json`, `README.md`, `eslint.config.js`, `examples/basic/App.tsx`, `tests/DatagridDX.test.tsx`, `tests/index.test.ts`, `.junie/plans/002-phase-1-read-only-managed-grid.md`.

## Tests added or changed
- Tested Scenarios A through J covering context rendering, generic types, string IDs, initial pending, empty data, background fetching, props passthrough, child columns, single data fetch verification, and safeguards.

## Current test count
- 14 passing tests across 2 test files (`tests/index.test.ts` and `tests/DatagridDX.test.tsx`).

## Verification
- `pnpm lint`: Pass (0 errors, 0 warnings).
- `pnpm format:check`: Pass.
- `pnpm typecheck`: Pass (0 errors).
- `pnpm test`: Pass (14/14 tests).
- `pnpm build`: Pass (0.92 kB ESM bundle).
- `pnpm build:example`: Pass.
- `pnpm pack --json`: Verified clean package contents.

## Type declaration inspection
- `dist/DatagridDX.d.ts` and `dist/types.d.ts` preserve generic `<RecordType extends RaRecord = RaRecord>` and cleanly omit internal keys.

## Bundle inspection
- Bundle externalizes `react`, `react-admin`, `devextreme-react`, and `react/jsx-runtime`.

## Example application
- Renders full `<Admin>` + `<List>` with in-memory provider and custom DevExtreme columns.

## CI
- Existing GitHub Actions workflow remains suitable.

## Deviations from the Phase 1 plan
- None.

## Known limitations
- Paging and interactive sorting integration deferred to Phase 2.
- Selection and row click navigation deferred to Phase 3.
- Filtering deferred to Phase 4.
- Remote operations deferred to Phase 5.

## Risks or concerns
- DevExtreme JSDOM layout measurement quirks require instance option inspection rather than pixel layout checks in headless unit tests.

## PRD feedback
- None; the PRD assumptions proved accurate for Phase 1.

## Recommended next step
- Ready for Phase 2: Managed Paging and Sorting.
