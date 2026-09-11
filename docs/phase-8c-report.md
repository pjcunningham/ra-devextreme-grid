# Phase 8C — Remote Group Paging

## Implementation summary

**Implemented:** opt-in DevExtreme 26.1.4 remote group paging, lazy parent/subgroup expansion, scoped SQL group and record pages, collapsed counts/summaries, and a separate browser resource. Flat mode and Phase 8B complete-tree grouping remain the defaults and pass regression tests. No dependency upgrade, seed/schema change, authentication, persistence, editing or unrelated advanced-filter feature was introduced. No commit, push, tag or publication was performed.

All historical plans through 012 and the requested reports were read before implementation. The initial working tree was clean `main`; GitHub metadata confirmed the supplied repository. Native probes preceded the saved [Phase 8C plan](../.junie/plans/013-phase-8c-remote-group-paging.md) and source implementation. The user explicitly approved the narrowly necessary `groupPagingContext` transport addition after a conformance test proved an ambiguity.

## Native DevExtreme group-paging investigation

Installed `devextreme` and `devextreme-react`: **26.1.4**. Eight retained scenario tests in `tests/remoteGroupPagingSemantics.test.tsx` use public React DataGrid, CustomStore and ArrayStore APIs; no undocumented implementation imports. Each load is copied before native response mutation, with request/page/visible-row snapshots. The probe dataset has unequal company cardinalities, case-distinct strings and NULLs. It is an in-memory protocol probe, not the SQL implementation or HTTP evidence.

Configuration uses all six remote operations, `grouping.autoExpandAll=false`, and grouped-column `autoExpandGroup=false`, as required by DevExtreme documentation. Below are actual query-shaping fields; inactive `searchOperation`, `searchValue`, `userData` and null sort bookkeeping are omitted for readability. Complete native snapshots remain in the tests. HTTP samples later include the adapter's approved context addition.

### Initial, next and resized pages

Both one-level country grouping and configured country/company grouping initially send **only country**:

```json
{
  "requireTotalCount": true,
  "skip": 0,
  "take": 3,
  "group": [{ "selector": "country", "desc": false, "isExpanded": false }],
  "groupSummary": [
    { "selector": "id", "summaryType": "count" },
    { "selector": "amount", "summaryType": "sum" }
  ],
  "totalSummary": [
    { "selector": "id", "summaryType": "count" },
    { "selector": "amount", "summaryType": "sum" }
  ],
  "requireGroupCount": true
}
```

Next collapsed page: `skip:3,take:3,requireGroupCount:true`, retaining group summaries but omitting cached record total and total-summary descriptors. Changing page size to 5 while on page index 1 produced `skip:5,take:5` in the probe. The browser's fresh-first-page size change produced `skip:0,take:5` and five groups; navigation then requested `skip:5,take:5` and the remaining three.

An important observation: previously downloaded group slices can satisfy a resized page without HTTP. The retained browser test starts a fresh store before proving the uncached five-group response; it does not demand a request when native caching legitimately satisfies the page.

### Parent expansion

For two configured levels, expanding A first asks for a child-group count:

```json
{
  "skip": 0,
  "take": 1,
  "requireGroupCount": true,
  "requireTotalCount": false,
  "filter": ["country", "=", "A"],
  "group": [{ "selector": "company", "desc": false, "isExpanded": false }]
}
```

It then reloads the necessary root headers and requests the visible company page. A child-page request observed `skip:0` with **no take** when all remaining child groups fit. With less space it supplies a take, such as 1. Child group requests omit total summaries in these scenarios. Returning a global country group count here is incorrect: the requested count is companies inside A.

### Nested expansion and leaf paging

The probe's nested A/X expansion requested:

```json
{
  "sort": [
    { "selector": "country", "desc": false, "isExpanded": false },
    { "selector": "company", "desc": false, "isExpanded": false }
  ],
  "group": null,
  "requireTotalCount": false,
  "take": 2,
  "groupSummary": [
    { "selector": "id", "summaryType": "count" },
    { "selector": "amount", "summaryType": "sum" }
  ],
  "totalSummary": [
    { "selector": "id", "summaryType": "count" },
    { "selector": "amount", "summaryType": "sum" }
  ],
  "requireGroupCount": false,
  "filter": [["country", "=", "A"], "and", ["company", "=", "X"]]
}
```

Initial skip can be omitted, meaning zero. A continuation used `skip:2,take:3`. Parent group descriptors can reappear in **sort**, including `isExpanded:false`. Independent leaf loads can copy both summary descriptor arrays despite `group:null`; globally rejecting group summaries without a current group would break this native request.

### Filtering, ordering, collapse and transitions

Filtering expanded groups produces count-refresh and position/rank probes, not just a replacement root page:

```json
{
  "skip": 0,
  "take": 1,
  "requireGroupCount": false,
  "requireTotalCount": true,
  "filter": [["country", "=", "A"], "and", ["active", "=", true]],
  "group": null
}
```

```json
{
  "skip": 0,
  "take": 1,
  "requireGroupCount": true,
  "requireTotalCount": false,
  "filter": [[["country", "<", "A"], "or", ["country", "=", null]], "and", ["active", "=", true]],
  "group": [{ "selector": "country", "desc": false, "isExpanded": false }]
}
```

Descending group order uses descriptor `desc:true` and the preceding-group comparison `country > A`. Ordinary record sorting appends its descriptor after parent-group sort descriptors. The special string comparisons are not ordinary user-filter operators: only the validated native group-count probe grammar permits them.

Collapse/re-expand generated new scope requests with both tested cache settings; parent child-count probes repeat. Expanding an already expanded row makes no request, and cached page navigation can make none. The adapter adds no cache. NULL equality paths work for parent and nested subgroup probes. Ungrouping returns to ordinary record paging and total counts with no group context; regrouping issues a new collapsed root request. DevExtreme owns all expansion state.

### Proven ambiguity, not a convenience marker

These two native states produce **identical complete count-refresh LoadOptions**:

1. Group by country; user filter `company = X`; refresh expanded A's record count.
2. Group by country/company; no user filter; refresh expanded A/X's record count.

```json
{
  "skip": 0,
  "take": 1,
  "requireGroupCount": false,
  "requireTotalCount": true,
  "filter": [["country", "=", "A"], "and", ["company", "=", "X"]],
  "group": null
}
```

Existing case-insensitive user equality requires **6** fixture records in the first case, while exact group identity requires **5** in the second. The test asserts the actual requests are equal and independently asserts those cardinalities. A stateless backend cannot infer the distinction. The user approved optional typed `groupPagingContext` containing full configured groups and the original user filter. No parentKey, parentPath, expandedGroup, second expansion controller or standalone Boolean wire marker was invented.

## Group paging contract

| Field           | Meaning / validation                                                                                                                                                              |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `skip` / `take` | Current-scope group offsets/sizes, or leaf-record offsets/sizes; not rendered-row offsets. Native can omit initial skip or fitting child take.                                    |
| `count`         | Complete matching record cardinality of a returned group, never current page length; finite nonnegative integer and required for null items.                                      |
| `groupCount`    | Number of groups at the top level of the current load's scope, including NULL; required/returned only when requested true.                                                        |
| `totalCount`    | Matching records for the current native request scope: global filtered count at root, parent-scoped record count for leaf refreshes.                                              |
| `isExpanded`    | Lazy current-group descriptors are false. The configured context is also collapsed. Complete-tree mode separately still accepts the native final false flag with complete arrays. |
| `items:null`    | Collapsed lazy contents; no fabricated children/counts. Only permitted in active group-paging mode.                                                                               |

The count experiment deliberately substitutes immediate-child count for non-final parent count: the native expansion sequence does not change because DevExtreme obtains child cardinality through a separate `requireGroupCount` request. The backend consistently supplies SQL leaf-record count at every level; this report does **not** claim that a non-final returned count drives native child pagination. Final-group counts support record paging.

The UI pager accounts for headers and continuation headers. At page size 3, a country header plus company header leave one record slot; the next UI page can therefore request one more record, not three. Backend limits remain 100: explicit lazy skip/take are strict, skip >=0 and take 1–100; omitted skip becomes 0 and omitted lazy take is bounded to 100. This is not permission to configure arbitrarily large native pages.

## Public API

```tsx
<DatagridDXRemote<Customer>
  groupPaging
  grouping={{ autoExpandAll: false, contextMenuEnabled: true }}
  paging={{ pageSize: 3 }}
>
  <Column dataField="country" groupIndex={0} autoExpandGroup={false} />
  <Column dataField="company" groupIndex={1} autoExpandGroup={false} />
  <Column dataField="id" autoExpandGroup={false} />
</DatagridDXRemote>
```

The Boolean prop defaults false. All six remote operations are true in lazy mode. Every grouped column must set `autoExpandGroup=false`; errors identify the offending column. `DatagridDXRemoteGroupingOptions.autoExpandAll` is Boolean rather than a large discriminated union, with mode-dependent runtime validation. **`expandAll()` must not be used with `groupPaging`.** Incompatible operation overrides and detectable expand-all load states fail before provider access, without monkeypatching native methods.

Public DataSource grouping and `getCombinedFilter(true)` supply request context. Native filter arrays can contain non-index `columnIndex` metadata; HTTP serialization preserves their actual array query values. Changing groupPaging recreates the CustomStore; an unrelated settled React rerender preserves it and causes no load in the mounted regression. No React-Admin ListContext or group state is added.

## Compatibility modes

| Mode                   | Behavior                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Flat                   | Existing record paging/filter/sort/totals, `RecordType[]`, no groupPagingContext, including after ungrouping.                         |
| Phase 8B complete tree | groupPaging omitted/false, autoExpandAll true, no grouped skip/take, complete recursive arrays only, final isExpanded false accepted. |
| Phase 8C group paging  | Explicit true, collapsed configuration, context-gated lazy validation and SQL-scoped group/leaf pages.                                |

The original fully grouped resource remains intact. Browser navigation from the new resource back to it verifies complete arrays and absence of context/grouped paging. The basic in-memory example provider is not upgraded into a lazy-group server; opt-in requires a provider implementing the capability.

## Public TypeScript contract

```ts
export interface GetGridGroupItem<RecordType extends RaRecord = RaRecord> {
  key: GetGridGroupKey;
  items: Array<RecordType | GetGridGroupItem<RecordType>> | null;
  count?: number;
  summary?: GetGridSummaryValue[];
}
export interface GetGridGroupPagingContext {
  group: GetGridGroupDescriptor[];
  filter: unknown[] | null;
}
export interface GetGridLoadOptions {
  // Existing load members unchanged; additive context:
  groupPagingContext?: GetGridGroupPagingContext;
}
export interface GetGridSortDescriptor {
  selector: string;
  desc: boolean;
  // Native parent-sort metadata:
  isExpanded?: boolean;
}
```

Normalization receives capability context; it does not globally loosen Phase 8B rules. Runtime result validation knows the remaining configured group depth, distinguishes independent leaf records, rejects mixed shapes, and validates optional counts even for expanded arrays. Arrays need not carry count. Original provider errors retain identity in the covered rejection paths.

## Backend wire contract

The envelope remains `{loadOptions:{...}}`. `GridGroupItem.items` is `list[CustomerRead | GridGroupItem] | None`, with optional strict nonnegative integer count and model validation requiring count for null items. Request-aware response validation retains the complete-tree prohibition and homogeneous depth rules. Serialization explicitly retains `items:null` while omitting unrequested response metadata.

The following are representative actual browser requests/results; property order is immaterial. Initial root load:

```json
{
  "loadOptions": {
    "groupPagingContext": {
      "group": [
        { "selector": "country", "desc": false, "isExpanded": false },
        { "selector": "company", "desc": false, "isExpanded": false }
      ],
      "filter": null
    },
    "group": [{ "selector": "country", "desc": false, "isExpanded": false }],
    "skip": 0,
    "take": 3,
    "requireTotalCount": true,
    "requireGroupCount": true,
    "groupSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ],
    "totalSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ]
  }
}
```

```json
{
  "data": [
    { "key": "Australia", "items": null, "count": 10, "summary": [10, 40.333333333333336] },
    { "key": "Brazil", "items": null, "count": 10, "summary": [10, 43.875] },
    { "key": "Canada", "items": null, "count": 10, "summary": [10, 39.77777777777778] }
  ],
  "totalCount": 100,
  "groupCount": 8,
  "summary": [100, 41.76470588235294]
}
```

Child company page (distinct from the preceding take-1 count probe):

```json
{
  "loadOptions": {
    "groupPagingContext": {
      "group": [
        { "selector": "country", "desc": false, "isExpanded": false },
        { "selector": "company", "desc": false, "isExpanded": false }
      ],
      "filter": null
    },
    "group": [{ "selector": "company", "desc": false, "isExpanded": false }],
    "skip": 0,
    "requireTotalCount": false,
    "requireGroupCount": true,
    "filter": ["country", "=", "Australia"],
    "groupSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ]
  }
}
```

```json
{
  "data": [
    { "key": "Massive Dynamic", "items": null, "count": 10, "summary": [10, 40.333333333333336] }
  ],
  "groupCount": 1
}
```

Independent leaf record page:

```json
{
  "loadOptions": {
    "groupPagingContext": {
      "group": [
        { "selector": "country", "desc": false, "isExpanded": false },
        { "selector": "company", "desc": false, "isExpanded": false }
      ],
      "filter": null
    },
    "take": 1,
    "requireTotalCount": false,
    "requireGroupCount": false,
    "sort": [
      { "selector": "country", "desc": false, "isExpanded": false },
      { "selector": "company", "desc": false, "isExpanded": false }
    ],
    "filter": [["country", "=", "Australia"], "and", ["company", "=", "Massive Dynamic"]],
    "groupSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ],
    "totalSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ]
  }
}
```

```json
{
  "data": [
    {
      "name": "Frank Smith",
      "company": "Massive Dynamic",
      "city": "Sydney",
      "country": "Australia",
      "active": true,
      "age": 47,
      "joined_on": "2021-03-12",
      "id": 6
    }
  ],
  "summary": [100, 41.76470588235294]
}
```

Normalization omits inactive `group:null` in the HTTP leaf payload, while preserving explicit false count flags and native parent-sort metadata. No grouping type is imposed on the record object itself.

## SQL strategy

`paging.py` builds pure validated native scope predicates; `query.py` remains the only grid SQL execution owner. Configured/current selectors resolve through `CUSTOMER_GRID_FIELDS`. The backend removes known original-user-filter conjuncts without mutating the input, validates the remaining exact prefix or native position-count grammar, and compiles the original Phase 7 user filter once. Unsupported keys/operators/intervals/depths/summaries/sorts/page values and constructed-model bypasses are rejected before any SQL.

| Request          | SQL                                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Root group page  | Filtered GROUP BY current key; COUNT(*) plus all group summaries in the same SELECT; deterministic group ordering, OFFSET/LIMIT. |
| Child group page | Same grouped aggregate SELECT with validated exact parent WHERE predicates.                                                      |
| Group count      | COUNT over grouped subquery for the current scope, retaining NULL groups.                                                        |
| Leaf page        | Customer SELECT with original filter AND exact full parent path, native sort plus id tie-breaker, OFFSET/LIMIT.                  |
| Record count     | COUNT(*) for the actual scoped request when requireTotalCount is true.                                                           |
| Global totals    | One aggregate SELECT over the original user-filter dataset only when totalSummary is present.                                    |

Native preceding-group comparisons use existing lowercase order and BINARY tie-order, with bound key values and NULL placement. They do not enable string inequalities in the ordinary user-filter compiler. Group-summary expressions reuse the established summary builder. No raw client SQL, per-group queries, Python record slicing or complete-tree assembly occurs in lazy mode.

## No-N+1 evidence

SQLAlchemy execution listeners and statement inspection assert:

| Representative request                                            | SELECTs |
| ----------------------------------------------------------------- | ------: |
| Root page, both counts and both summaries                         |       4 |
| Child page, groupCount and five group aggregates                  |       2 |
| Leaf page, scoped totalCount and global summary                   |       3 |
| Same seed complete-tree comparison, two levels and all operations |       6 |

All tested count/summary flag combinations follow `1 + requested_total_count + requested_group_count + requested_total_summary`. Group summaries add **zero** statements. Fixtures with **3 groups/6 records** and **125 groups/249 records** retain the same two-/four-query budgets. Tests inspect seven selected columns for key/count/five summaries and verify SQL LIMIT 2 OFFSET 1 with expected C001/C002 group counts 2/3. Omitted child take yields a SQL limit of 100, not an unbounded download. The original user compiler is called exactly once for root, child, leaf, rank and duplicate/nested-AND cases.

Native UI expansion can issue several separate loads (count probe, necessary headers, child/record page). These per-request SQL budgets are not falsely presented as the total work for an entire user click.

## Paging efficiency

Initial group pages select aggregate group rows, not Customer entities, and return no record nodes. OFFSET/LIMIT operate on SQL groups. The 100-row comparison returns three roots versus eight complete roots/100 record leaves; larger-cardinality instrumentation confirms the query count does not scale per returned group.

## Expansion efficiency

Child groups and leaf pages carry exact validated parent predicates. Browser captures assert all independent leaf records belong to Australia/Massive Dynamic, with IDs matching the requested record slice, and SQL tests inspect the WHERE/order/offset/limit. Native may reload unrelated **headers** needed for the visible root page; it does not download those groups' record contents. No blanket “one HTTP request per expansion” claim is made.

## Count semantics

`count` is whole-group matching records, `groupCount` is current-scope groups, and `totalCount` is current-scope matching records. For the browser: country roots have counts 10 or 20; root groupCount is 8; expanding Australia requests company groupCount 1; its leaf group count is 10; root totalCount stays 100. A nullable age root contributes one of 10 age groups and has count 15. Each count is SQL-derived, never `len(page)`. Non-final native child-count consumption is qualified in the contract section above.

## Summary semantics

Collapsed group summaries describe the complete matching group; Australia and its Massive Dynamic child both show 10 / 40.33 before records load. Global count/average remain **100 / 41.76** while a single record is displayed. Active=true produces **75 / 40.75**. Native caching can omit totals; copied leaf descriptors still aggregate the original user-filter dataset, not just the parent group. Descriptor order, duplicates, JSON-safe positional results, NULL/empty behavior and summary bounds remain enforced.

## NULL/string/date group handling

- NULL grouping/counts use grouped subqueries and IS NULL predicates. Backend tests cover nullable paths at multiple levels; public native probes cover NULL parent/subgroup paths. Headed browser age-group expansion displays count 15 and remotely loads IDs 1 and 8 with `filter:[age,=,null]` and take 2.
- String group identity remains exact/BINARY (`UK` and `uk` separate), unlike Phase 7 user-filter equality. Native context disambiguates these semantics. Ordering retains the established lowercase primary/BINARY tie policy, including native rank queries.
- DATE path values must be YYYY-MM-DD and become validated Python date values; timestamp/timezone strings are not silently truncated. The example normalizes known DATE operands in both filter copies, non-mutatingly. Backend date paths and the new transport-copy test pass; existing Asia/Tokyo browser date-filter regressions also pass. A separate headed DATE-group expansion is not claimed.

## Response-size evidence

Actual endpoint UTF8 body lengths from `test_seed_complete_tree_vs_initial_root_page_response_size`, normal 100-customer seed, country/company, identical count/sum(age) summary descriptors and both counts:

|                         | Complete tree | Lazy initial take 3 |
| ----------------------- | ------------: | ------------------: |
| Response bytes          |        14,918 |                 246 |
| Returned root groups    |             8 |                   3 |
| Returned record nodes   |           100 |                   0 |
| totalCount / groupCount |       100 / 8 |             100 / 8 |
| SELECTs                 |             6 |                   4 |

The browser uses average rather than sum for presentation; the byte comparison deliberately holds its own summary descriptors identical. This is a deterministic evidence point, not a throughput or production benchmark.

## Browser E2E evidence

`tests/e2e/group-paging.spec.ts` retains four real HTTP/FastAPI scenarios:

1. Initial three collapsed groups, next SQL page, uncached five-group size change, subsequent skip 5/take 5, no page-size rollback, correct collapsed/global summaries.
2. Parent child-count/page, nested record page, next leaf slice, collapse/re-expand, grouped record sorting, no unrelated record contents, stable global footer.
3. Active filtering while expanded, count/rank reloads, descending group order via chip click, ungrouped record sorting/paging, regrouping, and navigation back to Phase 8B complete trees.
4. NULL age group, null-inclusive groupCount, count 15, remote null-path record page and visible IDs 1/8.

**25/25** full browser tests pass, including every existing flat and complete-tree scenario. **4/4** group-paging tests additionally pass headed Chromium (latest run 15.7s). Tests reject application response errors, page errors and unexpected error-level console messages; DevExtreme W0019/W0021 are distinguished. No application resource 404s occurred. Headed screenshots were opened and inspected: collapsed second page with size 5, expanded country/company plus sorted record ID 26, NULL-group records 1/8, and correct global footers are visible. This is automated headed smoke plus screenshot inspection, not a claim of human manual clicking.

Each group-paging test saves `all-http-and-errors.json`; headed output is under `test-results/group-paging-headed/`, with `group-paging-visible.png`. The full run also produces the standard Playwright report. Artifacts are ignored and not packaged.

## Fresh-server isolation

**Proven locally; no server reuse.** `pnpm test:e2e` starts its own Uvicorn and Vite and a new disposable SQLite database. The runner checks ports 8000/5174 before deletion/startup, strictly removes stale DB/journal/WAL/SHM files, sets GRID_E2E_FRESH to disable reuse, and checks absence before Playwright starts servers. Global setup runs after startup and verifies file existence/nonzero size plus the HTTP seed. Cleanup runs after Playwright stops the servers, not while their database connections are live.

Full-run evidence (25 passed in 55.9s): ports free; DB absent before startup; Uvicorn process **41336** started; FastAPI-created `examples/remote-fastapi/backend/data/e2e_customers.db`; HTTP totalCount **100**, first id **1**; database removed after shutdown **true**. Latest headed run independently repeated the sequence with Uvicorn process **24252**, four passed in 15.7s, and post-shutdown removal **true**. Vite was started by the configured second Playwright webServer on strict port 5174, with reuse disabled; successful browser assets came from that new server.

No unrelated process was killed. Before-start cleanup fails loudly with path and OS error. After-test cleanup is best-effort with explicit warnings and a reported success Boolean; a failed cleanup is not falsely called isolated teardown. Retiring the old global-teardown deletion and moving cleanup around the full Playwright process avoids the old silent-lock/ordering problem. Use package scripts for this guarantee; direct `playwright test` bypasses the outer runner.

## CI isolation

No new GitHub Actions run is available: no commit or push was requested/performed. The existing `.github/workflows/ci.yml` browser job runs `pnpm test:e2e`; it now uses the same fresh runner and CI also disables reuse. A developer's subsequent pushed browser job can provide independent CI evidence. Local runs with CI-style environment flags are **not** represented as GitHub CI results.

## Regression status

All previous managed/remote frontend, exhaustive filter/security/backend, total-summary and Phase 8B grouping tests remain enabled. Complete-tree no-paging/no-null checks and native final-false compatibility remain strict. Flat paging, page-size persistence, multi-sort, filters, date-only transport, 422 recovery, CORS, loading and summary footers pass. No known required Phase 8C semantic gap remains.

## Test counts

- **Vitest: 819 passed in 25 files**, including eight new native scenario tests, 36 lazy normalization/result cases, eight mounted capability cases and the DATE context transport case.
- **Pytest: 2,300 passed**, including 221 new paging/validation/evidence cases; six dependency/deliberately malformed-model warnings.
- **Playwright: 25 passed** in the full fresh run; **4 passed** additionally in latest fresh headed Chromium.

## Verification

All commands ran from the repository root; UV used the configured Python **3.13.12** backend environment. No skipped/disabled tests or weakened existing regressions.

| Required command                                                           | Result                                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                           | Exit 0; lockfile current, pnpm 10.20.0; no dependency changes.     |
| `pnpm lint`                                                                | Exit 0.                                                            |
| `pnpm format:check`                                                        | Exit 0 after final documentation formatting.                       |
| `pnpm typecheck`                                                           | Exit 0.                                                            |
| `pnpm test`                                                                | Exit 0; 819 passed / 25 files.                                     |
| `pnpm build`                                                               | Exit 0; library and declarations; index.js 32.19 kB, gzip 8.98 kB. |
| `pnpm build:example`                                                       | Exit 0.                                                            |
| `pnpm build:remote-fastapi`                                                | Exit 0.                                                            |
| `pnpm test:e2e`                                                            | Exit 0; 25 passed, 55.9s, fresh isolation.                         |
| `pnpm pack --json`                                                         | Exit 0; actual tarball contents inspected.                         |
| `uv sync --locked --directory examples/remote-fastapi/backend`             | Exit 0; 27 resolved, 26 audited.                                   |
| `uv run --directory examples/remote-fastapi/backend ruff check .`          | Exit 0; all checks passed.                                         |
| `uv run --directory examples/remote-fastapi/backend ruff format --check .` | Exit 0; 27 files formatted.                                        |
| `uv run --directory examples/remote-fastapi/backend pytest`                | Exit 0; 2,300 passed, six warnings, 7.14s.                         |
| `git diff --check`, `git status`, `git diff`                               | Exit 0; intended changes reviewed, only LF/CRLF notices.           |

Additional headed command: `pnpm test:e2e:headed tests/e2e/group-paging.spec.ts --output=test-results/group-paging-headed --reporter=list` — four passed. IDE build reports success with limited diagnostic collection; focused inspections report no errors. These are not substitutes for the actual CLI gates.

Development failures were fixed: widened-type fixtures, native group-key generic typing, a test's unstable paging/grouping object props, native filter-array metadata comparisons, browser response-wait/cache assumptions, pager transition timing, an unavailable group-chip context-menu action (use chip click), and one Ruff layout issue. No assertion was bypassed to conceal a backend query failure. Existing Vite dependency `use client` and large-chunk warnings, Node color-environment warnings, DevExtreme evaluation/fixture W1005 warnings, expected negative-test logs and Python deprecations remain separate from functional failures.

## Package inspection

`pnpm pack --json` and `tar -tf ra-devextreme-grid-0.0.0.tgz` show **20 entries**: 17 dist artifacts (JS, source map, declarations) plus package.json, README.md and LICENSE. No examples, backend/Python packages, tests, databases, screenshots, plans or E2E/report artifacts ship. Public declarations include nullable items/count, groupPagingContext and the adapter capability. Peer dependencies remain externalized. The locally created verification tarball was removed; nothing was published.

## Known limitations

- Lazy mode requires autoExpandAll=false and every grouped column autoExpandGroup=false; all operations remote; explicit page sizes bounded to 100. Do not call expandAll. Guards are focused, not a sandbox for all imperative APIs.
- No Header Filter, group intervals, sort-by-group-summary, Search Panel, Filter Builder, editing, remote React-Admin selection/bulk parity, state persistence or new authentication framework.
- Providers must implement the explicit context capability; the reference FastAPI provider does, while the basic in-memory provider remains complete-tree/flat only.
- Native headers occupy pager slots; caching and multiple loads per action are native behavior. Browser verification used Chromium with DevExtreme 26.1.4; other browser engines or future DevExtreme versions need their own conformance checks.
- SQLite Unicode/lowercase limitations, exact grouping versus user-filter identity, JavaScript numeric precision/SQLite aggregate overflow, DATE-only semantics and ordinary nullable-filter qualifications remain.
- SQL paging reduces transfer, not necessarily full aggregate-scan cost. Production performance depends on appropriate filter/group/sort indexes, transaction isolation, database size, authorization and query/body/time/resource limits. No SQLite-specific production indexes or cross-database performance claim is introduced. Complete-tree mode still transfers all matching records by design.

## Risks or concerns

The added context is justified by a reproduced native ambiguity but is an adapter-specific provider capability that must be documented and honored. Context changes with native grouping/filtering; it is not persistent expansion state. Separate count/summary/data statements rely on database transaction policy for concurrent-write consistency. Native count/rank/load behavior is more complex than a simple page-per-click protocol, so the retained conformance snapshots are important upgrade guards. Fresh teardown is explicitly best-effort on OS errors and CI evidence remains pending an actual developer push, not silently assumed.

## PRD feedback

Record these findings in a future deliberate PRD update; this task did not silently rewrite it:

- Two configured levels initially transmit only the current level; native child-count and group-position probes are part of the protocol.
- GroupCount is current-load-scope, not necessarily root-dataset groups. TotalCount can likewise be parent-scoped on record count refreshes; global total summaries need the original user-filter scope.
- Native skip/take can be omitted selectively and count groups or records, not rendered rows. Header-aware paging and caching change request counts.
- Final false in complete-tree mode is not lazy semantics. Explicit adapter capability and request-context/result validation must remain distinct.
- Identical native LoadOptions can require different exact/user-filter identity semantics, requiring the approved minimal configured-group/user-filter context.

## Phase 8 completion assessment

**Original Phase 8 — Advanced Remote Operations is complete within the agreed 8A/8B/8C scope.** Total summaries, complete-tree grouping/group summaries/counts, and opt-in lazy SQL group paging are implemented and verified. Documented excluded features and production hardening are not silently claimed complete.

## Recommended next phase

Per `000-prd.md`, **Phase 9 — State Persistence**: implement/document persistent grid state, investigate React-Admin preferences/store integration, and do not force a single persistence mechanism. Start with an explicit ownership/design investigation, especially for the two remote grouping capabilities. No Phase 9 implementation was begun.
