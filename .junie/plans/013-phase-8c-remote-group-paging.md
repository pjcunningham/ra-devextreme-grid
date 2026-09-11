# Phase 8C — Remote Group Paging

## 1. Baseline

Read all numbered plans 000–012, historical unnumbered plans, and the Phase 5, 7, 7B, 8A and 8B reports. Inspected the adapter, transport validators, backend grid registry/compiler/query/models, FastAPI frontend, browser harness and CI. Initial Git status was clean `main`. GitHub API metadata confirms the supplied public repository. Committed Phase 8B is the compatibility baseline; no dependencies need upgrading.

## 2–8. Native investigation before implementation

`tests/remoteGroupPagingSemantics.test.tsx` uses only public React DataGrid, CustomStore and ArrayStore APIs, installed DevExtreme **26.1.4**. The deterministic probe has unequal country/company cardinalities, case-distinct keys and NULL keys. Every load is copied before DevExtreme mutates responses. The probe provider is deliberately in-memory, not the backend implementation or an efficiency claim.

Configuration: all six remote operations enabled, `grouping.autoExpandAll=false`, grouped columns `autoExpandGroup=false`. Public DevExtreme documentation confirms these requirements and says calling `expandAll(groupIndex)` disables remote group paging. No private implementation imports or instance monkeypatches.

### Observed initial request (one AND two configured levels)

```json
{"requireTotalCount":true,"skip":0,"take":3,"group":[{"selector":"country","desc":false,"isExpanded":false}],"groupSummary":[{"selector":"id","summaryType":"count"},{"selector":"amount","summaryType":"sum"}],"totalSummary":[{"selector":"id","summaryType":"count"},{"selector":"amount","summaryType":"sum"}],"requireGroupCount":true}
```

Native also supplies inactive search defaults, `userData:{}` and `sort:null`. They are not query shaping. Crucially, two configured levels do NOT cause two initial descriptors: only the current requested level is sent.

### Page navigation and page-size changes

Next collapsed page: `skip:3,take:3,requireGroupCount:true`. With caching enabled the record-count and total-summary requests disappear, while group summaries remain. Changing size to 5 while on page index 1 requests `skip:5,take:5`; it does not necessarily reset the page index. Returning to a previously cached page can make no request.

`skip/take` count groups in a group request and records in a leaf request, not rendered rows. The GRID pager counts headers/continuation headers as well as visible children, so DevExtreme translates one UI page into multiple differently sized scope requests.

### Parent expansion (two configured levels)

First, a child-count probe:

```json
{"skip":0,"take":1,"requireGroupCount":true,"requireTotalCount":false,"filter":["country","=","A"],"group":[{"selector":"company","desc":false,"isExpanded":false}]}
```

Then a root page reload, followed by the visible child page:

```json
{"requireTotalCount":false,"requireGroupCount":true,"group":[{"selector":"company","desc":false,"isExpanded":false}],"groupSummary":[{"selector":"id","summaryType":"count"},{"selector":"amount","summaryType":"sum"}],"filter":["country","=","A"],"skip":0}
```

Native can OMIT `take` when the remaining children fit the page; it is not valid to reject every absent `take`. When fewer children fit, it supplies e.g. `take:1`. No total-summary request on this child-group page. `groupCount` counts companies inside A, not countries globally.

### Nested expansion / final leaf page

Native reloads the needed root and child headers, then requests:

```json
{"sort":[{"selector":"country","desc":false,"isExpanded":false},{"selector":"company","desc":false,"isExpanded":false}],"group":null,"requireTotalCount":false,"take":2,"groupSummary":[{"selector":"id","summaryType":"count"},{"selector":"amount","summaryType":"sum"}],"totalSummary":[{"selector":"id","summaryType":"count"},{"selector":"amount","summaryType":"sum"}],"requireGroupCount":false,"filter":[["country","=","A"],"and",["company","=","X"]]}
```

An initial leaf page can OMIT `skip` (zero). A continuation requested `skip:2,take:3` with the same path. Sort descriptors can retain native `isExpanded:false` on parent group selectors. Leaf requests can retain group summaries and total summaries even though `group:null`; globally rejecting groupSummary without group is therefore wrong in this mode.

### Filtering, sorting, cache and transitions

- Filtering while groups are expanded preserves native expansion ownership and issues count-refresh requests before fetching the visible page. Example leaf count: `skip:0,take:1,requireGroupCount:false,requireTotalCount:true,group:null,filter:[[country,=,A],and,[active,=,true]]`.
- Native also requests group-position counts, e.g. `filter:[[[country,<,A],or,[country,=,null]],and,[active,=,true]]`, `group:[country]`, `requireGroupCount:true,requireTotalCount:false,skip:0,take:1`.
- Descending grouping changes the position comparison to `country > A` and descriptor `desc:true`. Ordinary record sorting adds `amount desc` after the parent selectors in leaf requests. These native group-position comparisons must NOT broaden the Phase 7 user-filter operator whitelist.
- Collapse and re-expand in both cache settings caused remote reloads; parent child-count probes repeat. Already expanded rows cause no new expansion load. Cached page navigation can reuse data. No adapter cache or parallel expansion controller will be added.
- NULL parent/subgroup paths use native equality-to-null expressions and expand through the same scoped requests.
- Ungrouping returns to flat `skip/take`, record sorting, `requireTotalCount:true`, no active group/group summary. Regrouping sends a new collapsed root page. No stale parent path is retained by the adapter.
- Group item `count` supplies complete matching leaf-record cardinality, never the returned page length. At a non-final level the experiment shows DevExtreme obtains immediate child cardinality separately with `requireGroupCount`; replacing the parent's count with immediate-child cardinality does not change that expansion sequence. Final-level record paging relies on the leaf count. Backend will supply consistent SQL record counts at every level; do not claim non-final count alone drives native child pagination.
- `items:null` is the collapsed wire form. Complete-tree mode still returns arrays despite its final `isExpanded:false`. Expanded arrays remain depth-validated and may omit count.

### Proven transport ambiguity and approved exception

A retained assertion demonstrates **identical native LoadOptions** for these distinct states:

1. One grouping level `country`, user filter `company = X` (case-insensitive), refreshing expanded A's record count.
2. Two grouping levels `country → company`, no user filter, refreshing expanded A/X's record count.

```json
{"skip":0,"take":1,"requireGroupCount":false,"requireTotalCount":true,"filter":[["country","=","A"],"and",["company","=","X"]],"group":null}
```

The fixture requires **6** records for case-insensitive company filtering versus **5** for exact company group identity. A stateless provider cannot infer the intended answer. The user explicitly approved optional typed **`groupPagingContext`**, containing configured group descriptors and the original user filter. It is absent in flat/Phase 8B requests. This is not an invented parent key/path and does not track expanded state; native `filter`, `group`, count flags and paging remain intact. It also identifies the original filtered dataset when native leaf requests copy total-summary descriptors.

## 9–21. Adapter and contracts

- Add explicit `groupPaging?:boolean`, default false. Keep complete-tree operation matrix unchanged; true enables all six remote operations. Require explicit compatible `autoExpandAll=false` and grouped-column `autoExpandGroup=false`; errors name offending columns. Reject incompatible imperative operation changes and expanded request shapes. Document no `expandAll`; no monkeypatch.
- Read full grouping descriptors and combined user filter through public DataGrid/DataSource APIs before each native load. Forward `groupPagingContext:{group,filter}` only while this mode has active groups. Recreate CustomStore when the capability changes, not unrelated renders.
- Normalize with mode context, preserve native paging/count flags, native group-sort flags and copied leaf summary descriptors. Group-paged requests request one collapsed level; reject expanded/full-tree ambiguity in that mode. Phase 8B keeps its grouped-paging rejection and positional non-final expansion requirements.
- Widen items to arrays or null, add optional count. Null requires finite integer count >=0. Arrays retain depth-aware homogeneous validation; complete-tree null remains invalid. Flat records still require canonical IDs. Mirror constraints in Pydantic and request-aware backend response handling.
- Keep page sizes bounded at 100. Native absent skip means zero; absent take in a lazy child scope uses bounded limit 100 (native supplies omission only when remaining scope fits its page). Explicit values stay strict, nonnegative skip and positive take. No unlimited query.

## 22–49. SQL and scope design

- Resolve context and current group descriptors against `CUSTOMER_GRID_FIELDS`; validate all structure before ANY SQL. Remove the known user-filter conjuncts from the native filter without mutating it; validate the remaining native path/rank grammar against configured grouping order. Reject mismatched/foreign selectors, malformed paths, unsupported interval/depth/summaries and unbounded requests.
- Compile the original user filter exactly once using the unchanged Phase 7 compiler. Compile exact path values separately with bound SQLAlchemy parameters, strict date-only values, `IS NULL`, exact BINARY string identity. Position comparisons follow existing group ordering including lowercase and BINARY tie-order, not user-filter equality.
- Root/child group page: one SQL `GROUP BY` over the requested key, count and all group summaries together, deterministic ordering, OFFSET/LIMIT. Scope is original filter AND validated native parent/rank predicate. Never build or slice a full record tree.
- Group-count query: COUNT over grouped subquery within current scope, retaining NULL group. Record-count query: COUNT within current scoped filter when requested. Total-summary query: complete original user-filter dataset, only when descriptors are present (including copied leaf descriptors).
- Leaf pages: scoped WHERE, native sort plus id tie-breaker, SQL OFFSET/LIMIT. No per-group queries and no Python slicing.
- Per-request statement budgets: one data SELECT, plus at most one each for requested totalCount, groupCount and totalSummary. Group summaries/count share the data SELECT. Typical root full operations <=4, child/count probe <=2, leaf <=3; independent of number of returned groups. Native UI actions may issue several such requests and must be reported separately.
- Preserve Phase 8B complete-tree query branch and flat branch. Tests must prove both remain unchanged and invalid lazy requests execute zero SQL.

## 50–83. Browser and validation

- Keep Grouped Remote Customers. Add separate Group-Paged Remote Customers initially country/company, both collapsed, page sizes 3/5/8: eight deterministic countries suffice for three genuine root pages without changing the 100-row primary seed. Keep group and global summaries.
- Retain conformance lifecycle assertions/snapshots for every native load including rank/count refresh, absent paging fields, NULL keys, cache and transitions. Add adapter/store/type/runtime guards and malformed result tests.
- Backend tests cover root/child/leaf paging, unequal cardinalities, exact case keys, NULL/date paths, summary scope, malformed context, native rank refresh and SQL instrumentation/query budgets. Compare deterministic complete-tree and initial lazy response sizes.
- Browser capture first/next/size pages, expand parent/nested leaf, collapse/re-expand, active filter, group and record order, footer stability, NULL grouping where practical, ungroup/regroup, and resource navigation back to Phase 8B. Attach real request/response evidence and screenshots; test visible results, not just request occurrence.
- Fresh isolation is mandatory. Check ports 8000/5174 without killing unrelated processes. Playwright must start both servers with a new disposable database. Fix setup ordering if needed: startup cleanup must precede webServer startup, fail loudly on stale-file removal errors, and prove absent/created/seeded/removed states. Teardown may remain best-effort with warnings. No fake CI claim.

## 84–89. Documentation, gates and completion

Update example/root README and roadmap only after requirements pass; original Phase 8 stays incomplete if required semantics remain unsupported. Create `docs/phase-8c-report.md` with every requested section, actual request JSON, count/scope/SQL/response-size evidence, exact test counts, fresh local versus CI evidence, all command results, package inspection and candid caveats. Record PRD feedback without rewriting the PRD. Recommended next original phase: Phase 9 — State Persistence (do not begin it).

Run all requested root commands: frozen install, lint, format check, typecheck, tests, library/basic/FastAPI builds, E2E, pack JSON. Run locked UV sync, Ruff check/format check and Pytest using the IDE-configured environment. Run headed Chromium group-paging scenarios, inspect resource/console failures separately from evaluation warnings, inspect package contents, `git diff --check`, `git status`, `git diff`. No commit/push/tag/publish.

Out of scope: Header Filter, group intervals, sort-by-group-summary, Search Panel, Filter Builder, editing, remote React-Admin selection/bulk parity, persistence, authentication, generic Python extraction. Production performance still requires suitable filter/group/sort indexes and deployment-specific transaction/time/memory limits; do not add SQLite-specific production indexes.

## Completion

Implemented and verified: 819 Vitest, 2,300 Pytest, 25 fresh-isolated Playwright tests, plus four fresh-isolated headed Chromium scenarios. The user-approved context exception is implemented; the Phase 8B default remains unchanged. SQL/response-size/browser evidence, all verification commands, local-versus-CI qualifications and the Phase 8 completion assessment are recorded in [the completion report](../../docs/phase-8c-report.md). No commit, push, tag, publication or PRD rewrite.