# Phase 8B — Remote Grouping, Group Summaries and Group Count

## Delivery status

**Phase 8B implemented and verified.** 766 Vitest, 2,079 Pytest and 21 Playwright tests pass; all four grouped scenarios additionally pass headed Chromium. Root/backend gates and package inspection pass. Local browser runs reused the existing backend after a port conflict, as detailed below; a fresh isolated-server run in this session is not claimed. No dependencies upgraded; no commit, push, tag, publication or PRD rewrite. Phase 8C is next, not implemented; original Phase 8 remains incomplete.

## Implementation summary

Phase 8B adds native one-/multi-level remote grouping through DataGrid → processed CustomStore → getGrid → HTTP → FastAPI → SQLAlchemy → recursive expanded groups. Public transport supports group descriptors, group summaries and top-level group counts alongside existing total summaries and record counts. Four-level/32-summary-item bounds, strict request validation and depth-aware response validation make the complete-tree contract explicit. Group Panel/context-menu configuration and native group-summary presentation are available without adapter-specific grouping components or React grouping state.

The initial working tree was clean on main. Existing plans 000–011 and Phase 5/7/7B/8A reports were read before implementation. Native investigation preceded the saved [Phase 8B plan](../.junie/plans/012-phase-8b-remote-grouping.md) and source edits. GitHub API metadata and local origin identify the supplied public repository. Committed code was the implementation baseline.

## Native DevExtreme grouping investigation

Installed **DevExtreme 26.1.4**, normal DataGrid, not PivotGrid. Public DataGrid, CustomStore, ArrayStore and DataSource APIs were used. Initially 23 passing probes established the plan; **27 retained conformance tests** now cover additional ungroup-all and duplicate-sort cases in `tests/remoteGroupingSemantics.test.tsx`. These are jsdom/store-load observations, distinct from the browser HTTP evidence below.

The native operations were explicitly paging/sorting/filtering/grouping/summary=true and groupPaging=false, with grouping.autoExpandAll=true.

Actual one-level JSON snapshot:

```json
{
  "searchOperation": "contains",
  "searchValue": null,
  "userData": {},
  "sort": null,
  "group": [{ "selector": "country", "desc": false, "isExpanded": false }]
}
```

Actual two-level snapshot with descending outer group, independent descending record sort, filter, group summaries and total summaries:

```json
{
  "searchOperation": "contains",
  "searchValue": null,
  "userData": {},
  "filter": ["amount", ">=", 20],
  "sort": [{ "selector": "amount", "desc": true }],
  "group": [
    { "selector": "country", "desc": true, "isExpanded": true },
    { "selector": "city", "desc": false, "isExpanded": false }
  ],
  "groupSummary": [
    { "selector": "id", "summaryType": "count" },
    { "selector": "amount", "summaryType": "sum" }
  ],
  "totalSummary": [
    { "selector": "id", "summaryType": "count" },
    { "selector": "amount", "summaryType": "sum" }
  ]
}
```

Raw undefined searchExpr/filter properties disappear under JSON. The adapter discards bookkeeping/inactive defaults, preserving actual query descriptors.

| Native property   | Observation                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| desc              | Present Boolean on every DataGrid group; ascending false, descending true                          |
| isExpanded        | Present; true on parents, **false on the final level**, even with autoExpandAll=true               |
| skip/take         | Absent in complete-tree group loads                                                                |
| requireTotalCount | Absent in these grouped loads; DataGrid derives row count from the tree                            |
| requireGroupCount | Absent without remote group paging in tested normal DataGrid configurations                        |
| groupSummary      | Ordered selector/summaryType array; group-only summaries also emit inactive totalSummary=[]        |
| group + sort      | Separate arrays; grouped columns do not duplicate into sort even with explicit sortIndex/sortOrder |
| groupInterval     | Not emitted by ordinary date grouping, even with a header-filter interval configured               |

String calculateGroupValue selects that field. Functional calculateGroupValue actually reaches load as a function, which JSON would silently drop: Phase 8B rejects it before transport. Generic DataSource can forward missing descriptor flags, intervals, functions, paging and explicit count flags; those broader data-layer capabilities are not evidence that normal complete-tree DataGrid requires them.

Removing the last group using clearGrouping or groupIndex=-1 emits group:null, no groupSummary, requireTotalCount:true and ordinary skip/take. Configured group-summary presentation remains in the widget without creating an orphan server aggregate request. Exactly one new flat load occurs; existing total summaries remain intact.

Expanded results containing only key/items and requested summary render without node count, response groupCount or response totalCount. Native also understands items:null/count and can generate additional flat leaf requests; this is a separate fallback deliberately blocked by Phase 8B response validation.

## Supported Phase 8B grouping mode

**Fully expanded remote groups with complete group contents.** The user's explicit amendment approved preserving the native final false flag rather than normalizing it:

```text
descriptors 0 .. n-2: isExpanded must be true
descriptor n-1:      isExpanded may be true or false
both final values:   complete expanded contents, never null items
```

Regression tests accept single false, true/false and true/true/false; reject false/false and true/false/false. Both frontend and backend enforce this positionally.

In DevExtreme 26.1.4, isExpanded:false on the final grouping descriptor does not by itself mean the server should return collapsed groups. Phase 8B preserves the native request while always returning complete arrays. autoExpandAll=false, column.autoExpandGroup=false, items:null, lazy requests, parent expansion state and remote group-page slices belong to **Phase 8C**, not this delivery.

## Public TypeScript contract

New exported contracts preserve record generics and JSON transport semantics:

```ts
export interface GetGridGroupDescriptor {
  selector: string;
  desc: boolean;
  isExpanded: boolean;
}
export type GetGridGroupKey = string | number | boolean | null;
export interface GetGridGroupItem<RecordType extends RaRecord = RaRecord> {
  key: GetGridGroupKey;
  items: Array<RecordType | GetGridGroupItem<RecordType>>;
  summary?: GetGridSummaryValue[];
}
export interface GetGridLoadOptions {
  skip?: number;
  take?: number;
  requireTotalCount?: boolean;
  sort?: GetGridSortDescriptor[];
  filter?: unknown[] | null;
  totalSummary?: GetGridSummaryDescriptor[];
  group?: GetGridGroupDescriptor[];
  groupSummary?: GetGridSummaryDescriptor[];
  requireGroupCount?: boolean;
}
export interface GetGridResult<RecordType extends RaRecord = RaRecord> {
  data: RecordType[] | GetGridGroupItem<RecordType>[];
  totalCount?: number;
  summary?: GetGridSummaryValue[];
  groupCount?: number;
}
```

MAX_GROUP_LEVELS=4 bounds recursive/query-depth complexity on both sides; it does not cap record cardinality. Explicit native objects require nonblank string selectors and Boolean fields. Extra keys, function selectors, intervals, nonfinal false and grouped skip/take reject. Active groupSummary and true requireGroupCount require active groups. Native null/empty groups and summaries are inactive. Summary normalization reuses the Phase 8A grammar, ordering/duplicates and 32-item limit independently for each summary collection.

The basic in-memory example remains flat-only; its return annotation now deliberately refines data to RecordType[] after the public result widening. No grouping evaluator was added there.

## Remote grouping props

DatagridDXRemoteGroupingOptions derives from native IDataGridOptions grouping, omitting/reintroducing autoExpandAll as optional true. groupPanel retains its native presentation type and hidden default. Native defaults are not overwritten by undefined top-level props, so Grouping and GroupPanel children resolve correctly. Runtime checks require resolved autoExpandAll=true.

```tsx
<DatagridDXRemote<Customer>
  grouping={{ autoExpandAll: true, contextMenuEnabled: true }}
  groupPanel={{ visible: true }}
>
  <Column dataField="country" groupIndex={0} />
  <Column dataField="company" groupIndex={1} />
  <Summary>
    <GroupItem column="id" summaryType="count" displayFormat="Customers: {0}" />
    <GroupItem column="age" summaryType="avg" displayFormat="Average age: {0}" />
  </Summary>
</DatagridDXRemote>
```

DatagridDXRemoteSummaryGroupItem derives from native SummaryGroupItem. Built-in types and selector/column rules match total items; presentation such as alignByColumn, showInGroupFooter, display/value formats and customizeText remains native. Custom summaries/calculation and skipEmptyValues=false reject.

Focused guards run at initialization, relevant option changes and before each store load, including cached descriptor-free loads. They reject autoExpandAll=false, column.autoExpandGroup=false, functional calculateGroupValue, excessive grouped columns, groupPaging and summary-based group sorting. Header Filter remains disabled, including nested configuration, and imperative enablement rejects. sortByGroupSummaryInfo and its default/change aliases are omitted. Adapter-owned mutable operation/hidden options are isolated per instance to prevent cross-grid contamination. Store identity, native paging and consumer event/ref composition remain stable.

## Group result validation

Validation uses normalized **requested depth**, not property-name heuristics to discover grouping. Every non-leaf position must contain a group with JSON-scalar key and dense items array. At the exact leaf depth records require valid canonical IDs; legitimate records can have key/items fields. Sparse arrays, missing/invalid keys, wrong nesting, missing/wrong-length/unsafe summaries and null items reject. Date objects and non-finite numbers are not JSON-safe group keys; providers serialize dates explicitly.

Each requested group-summary position is checked at every group level with the same scalar validator as total summaries; duplicates keep distinct positions. Unsolicited summaries and groupCount reject. Requested groupCount must be present, finite, integer and non-negative. Existing totalCount validation and provider-error identity are retained. Native errors are surfaced, not replaced by empty success.

## Backend wire models

Strict Pydantic v2 GridGroupDescriptor has selector, desc and Boolean is_expanded aliased as isExpanded. GridLoadOptions carries bounded group/group_summary lists and require_group_count aliases, with full-list positional validation and explicit grouped-paging rejection using model_fields_set. Flat default page size 20/max 100 is unchanged. GridGroupItem is recursive with strict scalar key, non-null CustomerRead/group arrays and optional scalar summaries. GridResponse accepts flat/groups and aliases group_count to groupCount; response_model_exclude_unset preserves absent optional fields and explicit null keys/ages/summary positions.

Explicit HTTP request requesting both counts and both summary kinds:

```json
{
  "loadOptions": {
    "group": [
      { "selector": "country", "desc": false, "isExpanded": true },
      { "selector": "company", "desc": false, "isExpanded": false }
    ],
    "filter": ["country", "=", "UK"],
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

Actual seeded response projection (full responses include every Customer field):

```json
{
  "data": [
    {
      "key": "UK",
      "summary": [10, 41.375],
      "items": [
        {
          "key": "Initech",
          "summary": [10, 41.375],
          "items": [
            { "id": 8 },
            { "id": 18 },
            { "id": 28 },
            { "id": 38 },
            { "id": 48 },
            { "id": 58 },
            { "id": 68 },
            { "id": 78 },
            { "id": 88 },
            { "id": 98 }
          ]
        }
      ]
    }
  ],
  "totalCount": 10,
  "groupCount": 1,
  "summary": [10, 41.375]
}
```

Reproduce actual HTTP/TestClient evidence with test_grid_group_evidence.py. This abbreviated projection is not presented as a complete wire payload.

## Field grouping capabilities

All current fields are explicitly groupable through **the same** CUSTOMER_GRID_FIELDS registry; unconfigured GridField defaults deny grouping. No parallel whitelist, dynamic getattr, raw SQL or client-selected SQL functions.

| Fields                    | Type    | Nullable | Groupable | Summary types         |
| ------------------------- | ------- | -------- | --------- | --------------------- |
| id                        | Integer | No       | Yes       | count/sum/avg/min/max |
| age                       | Integer | Yes      | Yes       | count/sum/avg/min/max |
| name/company/city/country | String  | No       | Yes       | count                 |
| active                    | Boolean | No       | Yes       | count                 |
| joined_on                 | DATE    | No       | Yes       | count                 |

Hostile password_hash, **dict**, customer.country and country; DROP TABLE customer selectors, non-groupable fields, malformed descriptors and unsupported summary capabilities fail before SQL.

## Group-key semantics

- **Strings:** native UK/uk are separate groups, but their ordering comparison ties and retains encounter order. Reference SQL explicitly uses BINARY identity, lowercase primary ASC/DESC ordering, and fixed BINARY ASC tie-breaking between case-equivalent keys. This intentional stable tie-break can differ from native encounter order. It keeps groups contiguous and deterministic. SQLite lower remains ASCII-limited; no arbitrary locale/Unicode parity claim. String filtering remains Phase 7 case-insensitive and may select both distinct case groups.
- **Integers:** numeric ascending/descending, e.g. -2,0,2,10; JSON numbers.
- **Booleans:** native and backend preserve Boolean keys; false before true ascending, reversed descending.
- **Dates:** native equal-timestamp Date instances coalesce and order chronologically; JSON.stringify turns native Date keys into ISO timestamps. Reference SQL DATE keys are explicitly YYYY-MM-DD strings, ordered chronologically and serialized without timezone truncation. No intervals or date hierarchies.
- **NULL:** own group, first ascending/last descending, included in group count. Native fixture ascending `[null,"DE","UK","uk","US"]`, descending `["US","UK","uk","DE",null]`.

Tests cover complete recursive shapes, exact case identity even when a registry expression has NOCASE collation, numeric/Boolean/date/NULL keys, and null-inclusive counts.

## SQL strategy

query.py remains the sole query execution owner; grouping.py contains pure descriptor/expression/order compilation and recursive tree assembly. Existing build_total_summary_expressions is reused unchanged for total **and** group summaries; no second aggregate dispatch/normalization grammar.

One grouped request executes only requested operations:

1. Optional SQL filtered row count.
2. Optional SQL whole-filter total aggregates.
3. Optional SQL top-level group count over a grouped subquery, retaining NULL.
4. One SQL GROUP BY aggregate SELECT for each grouping prefix depth when group summaries are active.
5. One complete filtered records/key stream in deterministic group order, then ordinary non-group sorts, then ID tie-break where needed. No grouped OFFSET/LIMIT. Flat requests still use normal SQL OFFSET/LIMIT.

Conceptual SQLAlchemy-generated structure:

```sql
SELECT country COLLATE BINARY, COUNT(*), AVG(age)
FROM customer WHERE <shared bound predicate>
GROUP BY country COLLATE BINARY;

SELECT country COLLATE BINARY, company COLLATE BINARY, COUNT(*), AVG(age)
FROM customer WHERE <same predicate>
GROUP BY country COLLATE BINARY, company COLLATE BINARY;

SELECT COUNT(*) FROM (
  SELECT age FROM customer WHERE <same predicate> GROUP BY age
);
```

These snippets explain structure; engine/cursor instrumentation asserts the actual SQL expressions, bindings, absence of aggregate ordering/paging and execution counts rather than brittle full SQL text snapshots. Group descriptors win over duplicate ordinary sort fields; ignored/conflicting sort selectors are still validated. Full-path tuples map SQL summary rows to corresponding nodes, avoiding child-key collisions across parents. Python only assembles already ordered rows and attaches SQL values; it does not aggregate.

## No-N+1 evidence

Real SQLAlchemy before_execute and before_cursor_execute instrumentation covers **50 and 100 top-level groups**, at one and two grouping levels, across all 16 combinations of count/summary options:

| Operations requested               | One level | Two levels |
| ---------------------------------- | --------: | ---------: |
| Both counts and both summary kinds |         5 |          6 |
| Group summaries only               |         2 |          3 |
| Both summary kinds, no counts      |         3 |          4 |
| Group data only                    |         1 |          1 |

Four levels with all operations execute **8** statements. Increasing group cardinality from 50 to 100 does not increase statement count. Formula: one records SELECT + requested row count + requested total summaries + requested group count + N prefix aggregate SELECTs if requested. This is depth-scaled, not per-group SQL.

## Filter reuse

The Phase 7 predicate compiles **once** before execution. Tests assert the exact same clause object in total count, total summary, top-level grouped-count subquery, every prefix summary query and records query. Invalid descriptors/selectors/group summaries execute **zero statements**. No per-depth recompilation, Python filtering or post-page grouping.

## Group summaries

For `[count(id),avg(age)]`, seeded UK and UK/Initech both return `[10,41.375]`. Germany returns `[20,42.0]`; Germany/Globex returns `[10,40.125]`. After active=true, Germany becomes `[15,40.46153846153846]`, Globex `[5,33.25]`, with leaf IDs `[11,31,51,71,91]`. SQL summary keys are full paths; identical final subgroup names under different parents do not overwrite values.

count/sum/avg/min/max, positional duplicates and parent/child summaries are tested. For an all-NULL age group, count means row count, sum=0, and avg/min/max=null. Total-summary behavior is not changed. Precision stays in the response; native display formats round only presentation.

## Group count

The unfiltered seed has eight top-level country groups. Explicit both-count requests return totalCount=100 and groupCount=8; active=true gives 75 and 8. Grouping country→company still counts eight countries, not the number of child groups. Nullable age tests include the NULL group via a grouped subquery, not nullable COUNT(DISTINCT).

In the deterministic ten-record fixture, active=true grouped by age returns keys `[null,0,30,40]`, totalCount=5 and groupCount=4. The NULL group has IDs `[1,8]` and count/sum/avg/min/max `[2,0,null,null,null]`; whole-filter values are `[5,70,23.333333333333332,0,40]`. Filtering age=null alone gives three leaves `[1,5,8]`, totalCount=3 and **groupCount=1**, not zero. Date→Boolean tests return exact date-only parent keys 2024-01-01/02/03 with correctly mapped Boolean subgroups and positional counts.

## totalCount versus groupCount

totalCount is **filtered records**. groupCount is **filtered top-level groups**. They are independent optional requests, not aliases or substitutes. A UK-only two-level response has totalCount=10, groupCount=1 and ten complete leaves. Normal complete-tree DataGrid does not request the flags; the backend still supports explicit provider/HTTP count requests.

## Total-summary coexistence

An unfiltered country→company request with both summary lists `[count(id),avg(age)]` yields top-level summary `[100,41.76470588235294]` and each node's own summary. active=true changes top-level summary to `[75,40.75]`; group summaries independently change under the same predicate. UK totals are `[10,41.375]`. Per-group arrays do not overwrite the global footer, and ordinary sort/paging presentation does not redefine summary membership.

## Paging investigation

**Mandatory finding:** with remote grouping=true/groupPaging=false and complete arrays, normal DataGrid load omits skip/take **and both count flags**. The backend rejects explicitly supplied grouped paging, including skip=0, instead of silently ignoring it or paging leaves before grouping.

Native default caching performs page navigation/page-size changes locally. cacheEnabled=false repeats complete-tree requests, still without paging/count fields. The server never slices groups in this phase.

Group headers and repeated continuation headers consume page slots. An eight-leaf, two-level native fixture at pageSize=5 produces **six pages**, identical for local DataGrid and complete-tree remote responses with no/group/both summary configurations:

```text
0: [null], [null,Unknown], 7, [DE], [DE,Berlin]
1: [DE], [DE,Berlin], 8, [UK], [UK,London]
2: [UK], [UK,London], 1, [UK,York], 3
3: [uk], [uk,London], 2, [US], [US,Boston]
4: [US], [US,Boston], 4, 5, [US,Denver]
5: [US], [US,Denver], 6
```

grid.totalCount() is still eight records. Exploratory pageSize=2/two-level probes exposed native empty/repeated-header irregularities; pageSize=5 equivalence and larger example defaults are covered. This is not evidence for implementing server paging. Explicit standalone DataSource pagination/count probes produced skip=0,take=2 and both count flags, but represent a different configuration rejected here.

## Browser E2E evidence

Four additive Playwright scenarios exercise the real browser → getGrid → FastAPI → SQLite → grouped DataGrid path. All 17 existing scenarios remain unchanged. The dedicated grouped resource starts country→company, uses default native caching and pageSize=25 (25/50/100 choices). The original flat resource is unchanged; both map to the same endpoint.

Actual automatic two-level request:

```json
{
  "loadOptions": {
    "group": [
      { "selector": "country", "desc": false, "isExpanded": true },
      { "selector": "company", "desc": false, "isExpanded": false }
    ],
    "totalSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ],
    "groupSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ]
  }
}
```

Native Company ungrouping gives this one-level request, not a normalized expansion flag:

```json
{
  "loadOptions": {
    "group": [{ "selector": "country", "desc": false, "isExpanded": false }],
    "totalSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ],
    "groupSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" }
    ]
  }
}
```

Neither contains skip/take or either count flag. Complete responses are compared against an **independently calculated seeded tree**, including every record, group membership/order and all summary positions. Top keys: Australia, Brazil, Canada, France, Germany, Japan, UK, USA. Group nodes have complete arrays and no lazy count/items:null fields.

- Initial visible rows show `Country: Australia (Group customers: 10, Group average age: 40.33)` and nested `Company: Massive Dynamic` with the same summary; leaf IDs start 6,16,26,…,96. Brazil/ Soylent follows with count 10/average 43.88. Global footer shows `Total customers: 100` / `Total average age: 41.76`.
- One-level native ungrouping displays country rows and complete corresponding leaves/summaries. Context-menu regrouping produces a new two-level server request.
- Boolean active=true is present in the actual request and changes the global response to `[75,40.75]`, visibly `75 / 40.75`. Germany changes from 20/42 to 15/40.46153846153846; Germany/Globex from 10/40.125 to 5/33.25 with active IDs 11,31,51,71,91. UK/Initech retains its ten expected IDs and 10/41.375.
- Separately labeled **explicit browser-fetch count probes** copy captured grouped requests and add both count flags: unfiltered totalCount=100/groupCount=8, active totalCount=75/groupCount=8. These are not fabricated automatic widget requests.
- Clicking native grouped-column direction changes group[0].desc=true and visibly puts USA first; ascending restores Australia first.
- Ungroup All returns native flat skip=0,take=25,requireTotalCount=true with totals and no grouping fields. Subsequent cached flat pages send only skip/take and preserve footer/count metadata.

Actual full-suite request/response JSON and screenshots are in `test-results/grouping-FastAPI-complete--*/`; headed evidence is separately in `test-results/grouping-headed/`. A reviewed headed screenshot is `grouping-FastAPI-complete--36efc-pse-expand-paging-and-sizes-chromium/two-level-initial.png` under that headed directory. It shows the native panel, nested group summaries, records, continuation group header and distinct total footer. Evidence files are generated ignored test artifacts, not npm contents.

The first browser launch with CI-mode server startup encountered occupied port 8000. Successful local runs used `$env:CI = ''` so the committed reuseExistingServer behavior reused the already-running backend; UV_PYTHON pointed to PyCharm's Python 3.13.12 environment. No configuration was changed and no unrelated server was killed. Seed expectations were independently asserted over HTTP, but fresh backend/database isolation was **not established by these successful local runs**. The existing isolated CI lifecycle remains unchanged; rerun in a clean CI/free-port environment to establish that additional environment guarantee.

## Collapse/expand evidence

Native conformance and adapter integration tests prove complete cached outer/inner collapse/expand makes zero additional store loads. Real browser tests additionally observe **zero new grid POSTs** for Australia collapse, expansion, page 2/page 1 navigation, and each page-size change (50,100,25), while asserting visible membership/paging and retained total summaries. cacheEnabled=false repeating whole-tree loads is native-conformance evidence, not an additional uncached HTTP scenario. No items:null or lazy loading is implemented.

## Favicon cleanup

Resolved in `examples/remote-fastapi/frontend/index.html` using `<link rel="icon" href="data:," />`, no binary asset or library code. All four grouped scenarios passed headed Chromium. Each strict-browser-diagnostics.json records empty pageErrors, unexpectedConsole, resourceErrors and failedRequests; resource assertions reject every HTTP error and explicitly assert no 404. The previous /favicon.ico request/404 no longer occurs.

W0019/W0021 DevExtreme license messages and the evaluation banner remain visible and are recorded separately. The exact non-error Inferno message `You are running production build of Inferno in development mode. Use dev:module entry point.` is separately recorded as a known development warning. Unexpected warnings/errors are not suppressed, and the existing error-scenario listener was not weakened.

## Files changed

- Public adapter/types/exports: src/DatagridDXRemote.tsx, src/types.ts, src/index.ts, src/remote/types.ts, loadOptions.ts, createGridStore.ts, groupResults.ts, groupingOptions.ts, summaryOptions.ts.
- Frontend unit/native/type tests: remoteGroupingSemantics, remoteGrouping, remoteLoadOptions, createGridStore, DatagridDXRemoteGrouping, DatagridDXRemoteSummary, remoteIntegration, remoteTypes, summaryOptions. Basic remoteQuery has only a flat-return type refinement.
- Backend: app/grid/models.py, fields.py, grouping.py, query.py, app/main.py; existing tests updated for the result tuple/OpenAPI and new test_grid_group_models.py, test_grid_grouping.py, test_grid_group_execution.py, test_grid_group_evidence.py.
- Browser: frontend/src/GroupedRemoteCustomerList.tsx, App.tsx resource registration, dataProvider.ts resource/groupCount forwarding, frontend/index.html favicon, tests/e2e/grouping.spec.ts. Original flat component and all 17 existing E2Es remain unchanged.
- Documentation: saved Phase 8B plan, root/example READMEs and this report; roadmap marks 8B complete and 8C next, not all Phase 8 complete.

## Test counts

- Vitest: **766 passed across 21 files**, including 27 retained native grouping conformance cases, zero skips.
- Pytest: **2,079 passed**, all 1,787 pre-existing cases plus 292 new tests, zero skips, four warnings.
- Playwright: **21 passed**, all 17 original cases plus four grouping scenarios; **4/4 additionally passed headed**, no retries/skips in the successful runs.

## Regression status

All existing flat paging, page-size changes, multi-sort, filtering, date-only transport in Asia/Tokyo, provider/HTTP errors and recovery, native loading, total summaries and CORS regressions pass. Managed-mode tests remain green. All 17 pre-existing Playwright scenarios are unchanged and passing; grouping tests are additive. Local backend reuse is the environment qualification, not a disabled or mocked regression.

## Verification

| Command                                                                  | Result                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| pnpm install --frozen-lockfile                                           | Exit 0; lockfile up to date, no dependency changes                 |
| pnpm lint                                                                | Exit 0; no lint errors/warnings                                    |
| pnpm format:check                                                        | Exit 0; all matched files formatted                                |
| pnpm typecheck                                                           | Exit 0; full project TypeScript check                              |
| pnpm test                                                                | Exit 0; 766 tests, 21 files                                        |
| pnpm build                                                               | Exit 0; 28.98 kB ESM / 8.25 kB gzip plus declarations              |
| pnpm build:example                                                       | Exit 0; production basic example build, 3,286 modules              |
| pnpm build:remote-fastapi                                                | Exit 0; production FastAPI example build, 3,288 modules            |
| pnpm test:e2e                                                            | Exit 0; 21 passed in 46.6s, local server reuse as described        |
| pnpm pack --json                                                         | Exit 0; tarball entries inspected                                  |
| uv sync --locked --directory examples/remote-fastapi/backend             | Exit 0; 27 packages resolved, 26 audited                           |
| uv run --directory examples/remote-fastapi/backend ruff check .          | Exit 0; all checks passed                                          |
| uv run --directory examples/remote-fastapi/backend ruff format --check . | Exit 0; 24 files formatted                                         |
| uv run --directory examples/remote-fastapi/backend pytest                | Exit 0; 2,079 passed, four warnings, 5.57s                         |
| IDE build and focused inspections                                        | Build success with limited diagnostic support; no inspected errors |
| git diff --check / git status / git diff                                 | Exit 0; intended changes inspected; Git LF/CRLF notices only       |

Python uses the configured UV-managed Python 3.13.12 environment. Backend warnings: Starlette httpx and AnyIO portal deprecations; two Pydantic serializer warnings from deliberately malformed internal-model tests. No dependency changes or warning suppression.

Additional browser commands: `pnpm exec playwright test tests/e2e/grouping.spec.ts` — 4 passed in 16.6s; `pnpm exec playwright test tests/e2e/grouping.spec.ts --headed --output=test-results/grouping-headed` — 4 passed in 17.6s. Production example builds report existing ignored dependency use-client directives and >500 kB chunk notices. Vitest reports evaluation warnings, one fixture data-type W1005 warning and expected deliberately exercised provider-error logs, with no failures. No warning was used to excuse an application-resource error.

## Package inspection

`pnpm pack --json` and actual `tar -tf ra-devextreme-grid-0.0.0.tgz` inspection confirm only dist artifacts, package.json, README.md and LICENSE. No examples, Python/backend dependencies, E2E tests/screenshots/reports, databases, or plan files entered the package. Generated declarations preserve the recursive generic group types, Boolean final flag, safe native props and optional groupCount. Library runtime peers remain externalized; no DevExtreme CSS is bundled. The verification tarball is removed after inspection; nothing is published.

## Known limitations

- No remote group paging, items:null, collapsed/lazy server groups, per-group OFFSET/LIMIT or parent expansion state.
- No group intervals, Header Filter/distinct requests, sort-by-group-summary, Search Panel or Filter Builder.
- No editing, CRUD store methods, React-Admin remote selectedIds/bulk parity, state persistence or additional authentication framework.
- Fully expanded grouping can transfer many records; depth/summary limits do not bound response bytes, leaves or memory. No automatic cancellation or body/query timeout policy is added.
- Exact string grouping with fixed binary tie-order differs from native case-insensitive encounter-order ties. SQLite lowercase is ASCII-limited. Date keys are explicitly SQL DATE strings, not generic DATETIME/timezone semantics.
- Native two-level grouping with very small page sizes can produce empty/repeated-header pages; larger tested page sizes avoid the observed irregularity. Group headers count toward native page slots.
- Existing Phase 7 nullable inequality/NOT qualifications, JavaScript numeric precision and SQLite aggregate overflow limitations remain.

## Risks or concerns

Complete-tree mode is intentionally not a scalable replacement for group paging. Response size, query time, transaction isolation, authorization and deployment limits remain application concerns. Multiple SQL statements reuse a predicate, but consistency under concurrent writes still depends on database transaction/isolation policy. Arbitrary native components are not a general sandbox; focused guards cover Phase 8B invariants. DevExtreme evaluation warnings remain separate from application errors.

## PRD feedback

Do not rewrite the PRD silently. Future wording should distinguish final-level isExpanded=false from collapsed-server semantics, and record the actual non-group-paged omission of skip/take/count flags. Group header pagination is not ordinary row pagination. Grouping identity and sorting collation require separate explicit policies. Four-level limits bound query depth but not dataset transfer; preserve Phase 8C as its own phase and do not mark the original Phase 8 wholly complete.

## Phase 8C readiness

The recursive group contract, positional summaries, shared field registry, pure expression/tree helpers and centralized SQL execution are a clean base for Phase 8C. Widening items to include null can be additive before 1.0; Phase 8B complete-array behavior must remain valid. Future work needs native groupPaging=true probes, explicit parent/expansion state and skip/take semantics, collapsed-node count validation, bounded server group slices and SQL query strategies without N+1. The final flag alone must never choose lazy behavior. No Phase 8C implementation has started.

## End-of-phase architecture review

Transport/native flag fidelity, four-level bound, string selectors, positional parent expansion checks, interval rejection, recursive depth-aware validation and positional summaries are covered. Group counts are top-level and null-inclusive; total counts remain records. Filters compile once; summaries/counts stay SQL-side; statement counts scale with depth. Group keys/order are explicit and JSON-safe; grouped rows are never OFFSET/LIMIT-ed before assembly. Existing flat paging and total summaries pass. groupPaging=false, advanced-filter exclusions and no lazy groups remain intact. Browser and package checks pass with the documented local server-reuse qualification. No in-scope architecture blocker was identified for Phase 8C; investigate its native paging contract before implementation.
