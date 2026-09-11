### Implementation summary

Phase 5 implements a separate, read-only `DatagridDXRemote`, an internal processed `CustomStore` factory, a pure load-option normalizer, typed public provider contracts, native paging/multi-sort/Filter Row integration, and a dual-mode example. No dependencies were added or upgraded. No Python, commits, pushes, tags, or publishing were performed.

### Managed vs remote architecture

```text
Managed: React-Admin ListController → ListContext → DatagridDX → array-backed DataGrid
Remote:  ResourceContext + useDataProvider → DatagridDXRemote
           → native DataGrid / CustomStore → dataProvider.getGrid → application service
```

Managed source behavior is unchanged. Remote mode has no `ListContext`, managed sort/filter conversion, direct HTTP, or additional React Query layer. React-Admin still owns resource and provider integration; DevExtreme owns remote query state.

### DatagridDXRemote usage

```tsx
const RemoteCustomerList = () => (
  <DatagridDXRemote<Customer>
    paging={{ pageSize: 10 }}
    pager={{
      visible: true,
      showPageSizeSelector: true,
      allowedPageSizes: [5, 10, 25],
      showInfo: true,
    }}
    sorting={{ mode: 'multiple' }}
    filterRow={{ visible: true }}
    showBorders
  >
    <Column dataField="id" dataType="number" />
    <Column dataField="name" />
    <Column dataField="company" />
    <Column dataField="country" />
  </DatagridDXRemote>
);

<Resource name="remote-customers" list={RemoteCustomerList} />;
```

**Do not wrap it in React-Admin `<List>` or `<ListBase>` and do not use `DatagridDXPagination`.** Register it directly as the resource list page. Imports and the full provider integration example are in `README.md`.

### React-Admin integration

`useResourceContext` resolves route context with an explicit nonempty `resource` override. Missing/empty resources produce a component-specific error. The prop is stripped before forwarding native options. `useDataProvider<DatagridDXDataProvider>()` supplies the wrapped provider, preserving React-Admin authentication handling. Standard `getList` is never invoked by the remote adapter; wrapping it in a separate `<List>` would independently introduce that request.

### DataProvider extension

The exact public contract, exported through `src/index.ts`, is:

```ts
import type { DataProvider, RaRecord } from 'react-admin';

export interface GetGridSortDescriptor {
  selector: string;
  desc: boolean;
}

export interface GetGridLoadOptions {
  skip?: number;
  take?: number;
  requireTotalCount?: boolean;
  sort?: GetGridSortDescriptor[];
  filter?: unknown[] | null;
}

export interface GetGridParams {
  loadOptions: GetGridLoadOptions;
}

export interface GetGridResult<RecordType extends RaRecord = RaRecord> {
  data: RecordType[];
  totalCount?: number;
}

export interface DatagridDXDataProvider extends DataProvider {
  getGrid<RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetGridParams
  ): Promise<GetGridResult<RecordType>>;
}
```

`GetGrid*` names are concise and tied directly to the custom method; `DatagridDXDataProvider` makes the extension library-specific. `filter` deliberately requires narrowing unknown contents and does not promise a static backend operator grammar or JSON serialization. The source declaration documents Date preservation and executable-value rejection.

### Load-options contract

Only the five declared fields are forwarded. The normalizer preserves zero/false values, validates paging scalars, normalizes string/object/array sort forms into ordered descriptors, and preserves filter arrays and their values. Omitted sort directions become false. Recursively nested executable functions reject; traversal is cycle-safe. Native metadata on expression arrays is preserved rather than JSON-cloned.

Active projection, search, and other semantic inputs outside this contract reject rather than silently lose meaning. Benign bookkeeping and inactive native defaults are tolerated. The validator is intentionally not an operator compiler or a backend security boundary.

### Paging

Native DataGrid paging is always enabled, with native default page size 20 and zero-based page indexes. The example uses 10. `skip`/`take` are not translated to React-Admin page/perPage. DevExtreme owns page-size changes and resets, and may use cached rows or request only missing portions of a page. The normalizer preserves optional `requireTotalCount`; later page requests can omit it when the grid already knows the total.

### Multi-column sorting

The default sorting mode is `multiple`. Native sort indexes determine descriptor order, and all descending flags survive. Function selectors and malformed selectors/directions reject. The captured sorting request below demonstrates country descending before name ascending; no `setSort` synchronization exists.

### Remote filtering

Filter Row is opt-in. Native single/multiple column filters and nested Boolean expressions reach `getGrid` without `_q`, `_eq`, or `_gte` conversion. Tests use public `columnOption` and `filter` APIs where useful under jsdom, including nested OR/NOT. The adapter preserves Dates; serialization belongs to the application provider.

### CustomStore lifecycle

`createGridStore` is an internal non-React factory. `DatagridDXRemote` explicitly memoizes store creation on `[resource, dataProvider]`. Owned native options are stable too: testing caught and fixed a page reset caused by recreated option objects even when the store itself stayed unchanged. Tests prove settled unrelated rerenders preserve store, page, active sorting/filtering, and request count; resource/provider changes create a fresh store.

Grid/DataSource owns subscriptions and lifecycle. There is no extra DataSource or invented store disposal API. Remounts, Strict Mode, and wrapped-provider identity changes may produce legitimate additional loads.

### Loading behaviour

Controlled-promise tests verify native DataSource loading state for initial and subsequent requests, completion, and errors. Native `loadPanel` options are passed through. No managed `isPending`, `isFetching`, `beginCustomLoading`, or `endCustomLoading` path is used. Actual overlay appearance remains a browser-only check, not claimed from jsdom.

### Error behaviour

- Missing/non-callable `getGrid` produces `DatagridDXRemote requires the React-Admin dataProvider to implement getGrid(resource, params).`
- Membership-aware detection is tested on raw providers and actual React-Admin proxy-wrapped providers. Non-callable wrapped methods are handled deliberately while invocation still uses the wrapper.
- Normal provider rejections propagate through native `onDataErrorOccurred`; factory tests also verify rejection identity.
- Malformed data/counts reject with descriptive adapter errors, never successful empty data.
- A separate real-context test proves `authProvider.checkError` receives a `getGrid` rejection. Logout may transform rejected responses, so original-error preservation is not promised for every authentication failure. There is no added notification layer.

### Result validation

Results must be objects whose `data` is an array. Requested counts must be numeric, finite, and non-negative. Supplied optional counts obey the same rule; absent optional counts are omitted. Zero is valid. Neither `data.length` nor React-Admin `total` is used as a substitute. Records are not deeply validated; the store uses authoritative key `id` and processed load mode.

### Unsupported operation protection

Active `group`, `groupSummary`, `totalSummary`, and `requireGroupCount: true` reject before provider invocation. Null/empty advanced descriptors and false count flags are inactive. Tests cover these guards through the real public store and a forced native remote-grouping request/error callback.

Native nested children and imperative options are not a sandbox. With remote grouping disabled, forcing `Column.groupIndex` can group the current page locally instead of emitting a remote request. That configuration is explicitly unsupported and documented; guards catch actual advanced remote requests, not all possible native bypasses.

### Public prop ownership

`dataSource`, `keyExpr`, `remoteOperations`, paging enablement, and `syncLookupFilterValues` are adapter-owned. `DatagridDXRemoteProps<RecordType>` derives from native generic `IDataGridOptions` without widening managed props.

Omissions include persistence, grouping/group panel/summary, advanced filter/search UI, editing configuration and mutation callbacks, selection values/configuration/callbacks, and relevant generated default/change aliases. `defaultPaging` is omitted because its broad native type can bypass paging enablement. Native pager, sorting, Filter Row, load panel, error/row events, and safe column presentation remain available. Generic ref, record, key, and event types are tested.

### Meta decision

No `meta`: its identity/reload semantics need a deliberate later design.

### Abort/cancellation decision

No `signal`: installed public CustomStore load declarations expose no AbortSignal source. No cancellation guarantee is fabricated, including when the resolved resource changes.

### Selection decision

Selection is disabled and selection-related props/aliases are omitted. There is no remote React-Admin `selectedIds`/bulk-action bridge and no fake ListContext. Managed selection/navigation remains unchanged; remote native `onRowClick` is available without managed `rowClick` parity.

### Example application

The existing managed customer CRUD/list pages remain. A labeled `remote-customers` resource maps explicitly to the same complete 35-record dataset through the single extended provider. The isolated evaluator applies filter → ordered stable sort → count → slicing, without reading a grid instance or using managed suffix helpers. No artificial latency was added.

All ten planned operators and nested AND/OR/NOT are supported. Strings compare case-insensitively, finite numbers numerically, Dates by timestamp, without cross-type coercion. Nullish values compare equal; unlike/nullish relational comparisons are false. Mixed-type sort order and text/null handling are documented in the README. Unknown resources/fields/operators and malformed expressions reject. This is demo semantics, not a production database compiler.

### Actual request examples

These are actual captured `loadOptions` from `tests/remoteIntegration.test.tsx`, not desired hypothetical shapes. The provider receives them inside `{ loadOptions }` along with the resolved resource. Synthetic processed pages in these adapter tests intentionally include nonmatching/order-sensitive records to prove the grid does not reshape server results; separate evaluator tests prove full-dataset query semantics.

Paging:

```json
{ "skip": 20, "take": 20 }
```

Multi-sort:

```json
{
  "skip": 0,
  "take": 20,
  "requireTotalCount": true,
  "sort": [
    { "selector": "country", "desc": true },
    { "selector": "name", "desc": false }
  ]
}
```

Multiple Filter Row columns:

```json
{
  "skip": 0,
  "take": 20,
  "requireTotalCount": true,
  "filter": [["name", "startswith", "Customer"], "and", ["country", "=", "UK"]]
}
```

Combined paging, multi-sort, and filtering:

```json
{
  "skip": 40,
  "take": 20,
  "sort": [
    { "selector": "country", "desc": true },
    { "selector": "name", "desc": false }
  ],
  "filter": ["name", "contains", "Customer"]
}
```

JSON here displays expression items for readability; the adapter does not perform this serialization or strip native array metadata.

### Tests added or changed

| File                         |   Tests | Evidence                                                                       |
| ---------------------------- | ------: | ------------------------------------------------------------------------------ |
| `remoteLoadOptions.test.ts`  |      37 | Normalization, nested values/Dates, functions, unsupported inputs              |
| `createGridStore.test.ts`    |      24 | Processed mapping, proxy behavior, result/count validation, rejection identity |
| `DatagridDXRemote.test.tsx`  |      14 | Real-context resource/paging/lifecycle/loading/error/auth integration          |
| `remoteIntegration.test.tsx` |      12 | Native single/multi-sort, Filter Row/nested/combined requests, advanced guards |
| `remoteTypes.test.tsx`       |       3 | Public types, generics, omitted props/aliases                                  |
| `exampleRemoteQuery.test.ts` |      66 | Whole-dataset evaluation, operations, sorting, errors, immutability            |
| `index.test.ts`              | 1 added | Remote component exported, factory/normalizer not exported                     |

DevExtreme deferred promises are assimilated with `Promise.resolve` before Vitest rejection assertions to avoid a Chai/deferred interoperability error. No failing assertions were weakened or skipped.

### Current test count

**279 tests passed across 13 files:** the existing 122-test baseline plus 157 added tests. Full `pnpm test` passed with no failed or skipped tests.

### One-owner integration result

Real `AdminContext` + `ResourceContextProvider` tests render without `ListBase` and assert **`getGrid >= 1`, `getList = 0`**. Paging, sorting, and filtering continue through `getGrid` only. No fabricated ListContext dispatches are involved.

### Existing managed regressions

All prior managed tests remain green: paging, sorting, filter translation, selection, navigation, adaptive/column UX, and integration. No managed implementation files were refactored; only public types/exports were extended and one export test added. Managed example methods/pages retain their behavior.

### Manual verification

The example was launched with `pnpm dev --host 127.0.0.1 --port 5173 --strictPort`; Vite became ready, and both `/` and `/App.tsx` returned HTTP 200. This is a startup/HTTP smoke check, **not browser interaction evidence**.

No browser control capability was available in this session. Manual managed/remote pager, Filter Row editor, sort indicators, visible loading/error presentation, selection/navigation, and drag/resize/fixing scenarios remain unverified visually. Native public APIs and jsdom tests cover query/data/state behavior. No Playwright dependency or browser infrastructure was added. The server and generated pack archive were cleaned up after inspection.

### Verification

| Command                          | Final outcome                                                          |
| -------------------------------- | ---------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` | Passed; already up to date, no dependency changes                      |
| `pnpm lint`                      | Passed                                                                 |
| `pnpm format:check`              | Passed                                                                 |
| `pnpm typecheck`                 | Passed                                                                 |
| `pnpm test`                      | Passed: 279 tests, 13 files                                            |
| `pnpm build`                     | Passed; library 19.77 kB, gzip 6.17 kB, source map 61.15 kB            |
| `pnpm build:example`             | Passed; dependency `use client` and large-chunk warnings               |
| `pnpm pack --json`               | Passed; archive contents inspected                                     |
| IDE build/inspection             | Build success with limited build diagnostics; source inspections clean |
| `git diff --check`               | Passed; Git also reported LF/CRLF normalization notices                |

Test output includes DevExtreme trial/license warnings, expected provider-error logs, `W1011` for store-backed keyExpr, and a managed investigation's `W1005`. These did not cause test failures. No license data or proprietary assets were added.

### Type declaration inspection

Inspected `dist/index.d.ts`, `dist/types.d.ts`, `dist/DatagridDXRemote.d.ts`, and `dist/remote/types.d.ts`. Record/id/ref/provider generics are retained; selectors are strings and filters are `unknown[] | null`. Owned/deferred props remain omitted. Public contracts reference no private DevExtreme types or deprecated `ResolvedData`.

The factory uses public `LoadResultObject` internally. Declaration generation emits internal helper declaration files alongside existing managed helper declarations, but neither remote factory nor normalizer is exported from the package entry point, and the package exports map exposes only that entry point.

### Bundle/package inspection

Built imports retain external React (including JSX runtime), React-Admin, DevExtreme React, and `devextreme/data/custom_store`. Vite external patterns still cover all React, React DOM, React-Admin, DevExtreme, and DevExtreme React subpaths. Only 10 library modules were transformed; peers were not pulled into the library bundle. Theme CSS stays in `examples/basic/main.tsx`.

The inspected archive contains 17 entries: built JavaScript/source map/declarations, README, LICENSE, and package metadata. No tests, `.junie`, example output, local configuration, credentials, or proprietary assets are included. CI already runs the required gates and was unchanged. Final Git review includes only intended implementation, example, tests, documentation, and plan changes; nothing was committed.

### Deviations from the Phase 5 plan

No architectural deviation: the approved store-factory design and sequential delivery stages were followed. Small evidence-driven refinements include stable owned native option objects, omission of broad `defaultPaging`, explicit scalar validation, and native cached-partial-page handling in tests. Browser checks are the explicit verification limitation permitted by the plan. The numbered plan records the approved design; the unnumbered plan tracks execution status.

### Known limitations

No grouping, group paging, summaries, Header Filter distinct-value service, advanced filter/search UI, inline editing, persistence, React-Admin remote bulk selection, or managed row-navigation convenience parity. Arbitrary native children and imperative calls can bypass top-level restrictions. No cancellation/meta contract or backend security/compiler is supplied. Visual browser checks remain outstanding.

### Risks or concerns

Applications must whitelist fields/operators, validate payload sizes, define collation/null/time-zone behavior, and implement safe transport/backend queries. The generic provider resource/record relationship remains an application typing responsibility. React-Admin logout can transform responses. Compatibility was validated against installed DevExtreme/React wrappers 26.1.4 and React-Admin core 5.15.3, not every version allowed by peer ranges. Licensing and browser visual verification remain consuming-application responsibilities.

### PRD feedback

Replace the broad serializable request sketch with the five-field contract above. Dates remain native, so avoid a `SerializableGridLoadOptions` promise. Defer `signal` because there is no CustomStore signal source, and defer `meta` until reload semantics are designed. Use current public `LoadResultObject` and explicit processed loading. The store key is authoritative despite the planned consistent `keyExpr`; DevExtreme warns accordingly. Store stability also requires avoiding unnecessary native option reapplication. Remote-operation flags are not a complete sandbox for arbitrary native grouping configuration.

### FastAPI readiness

The frontend request/result contract is sufficiently small, typed, and tested to begin the Phase 6 reference backend. No unresolved frontend contract blocker was found. Phase 6 must explicitly define HTTP/date serialization, field/operator allowlists, database collation/null semantics, maximum paging sizes, and safe nested-expression compilation rather than treating the demo evaluator as production semantics.

### Recommended next step

Proceed to Phase 6 contract/backend work after developer review; complete the documented licensed-browser smoke scenarios before a release. Phase 6 was not started here.
