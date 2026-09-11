# Phase 8B — Remote Grouping, Group Summaries and Group Count

## 1. Baseline and investigation

Read plans 000–011 and the Phase 5, 7, 7B and 8A reports, then inspected the committed adapter, transport, SQL query/summary/registry/models, backend tests, FastAPI browser example and Playwright harness. Initial Git status: clean `main`. No dependency upgrades are needed. PyCharm is configured for the backend's UV-managed Python 3.13.12 environment. During verification, GitHub metadata/local origin confirmed the supplied repository and UV locked synchronization succeeded.

Before source implementation, public DataGrid/CustomStore/ArrayStore/DataSource probes against installed **26.1.4** were retained in `tests/remoteGroupingSemantics.test.tsx`: **23 passed**. These are native jsdom probes, not HTTP evidence. The implementation and browser tests will follow this saved design.

### Actual normal DataGrid load objects

One level (JSON serialization; raw searchExpr/filter are undefined):

```json
{"searchOperation":"contains","searchValue":null,"userData":{},"sort":null,"group":[{"selector":"country","desc":false,"isExpanded":false}]}
```

Two levels, descending country, ascending city, filter, row sort and both summaries:

```json
{"searchOperation":"contains","searchValue":null,"userData":{},"filter":["amount",">=",20],"sort":[{"selector":"amount","desc":true}],"group":[{"selector":"country","desc":true,"isExpanded":true},{"selector":"city","desc":false,"isExpanded":false}],"groupSummary":[{"selector":"id","summaryType":"count"},{"selector":"amount","summaryType":"sum"}],"totalSummary":[{"selector":"id","summaryType":"count"},{"selector":"amount","summaryType":"sum"}]}
```

- DataGrid supplies Boolean `desc` and `isExpanded` on every descriptor. `desc` tracks each group's sort direction. Grouped fields are represented by `group`, ordinary ungrouped sorting by `sort`.
- **Final-level `isExpanded:false` is normal even with `autoExpandAll:true`.** The user explicitly approved preserving it unchanged. Parents must have `isExpanded:true`; the last descriptor may have either Boolean value. Both last-level values mean complete arrays in Phase 8B. Runtime positional validation, not elaborate tuple typing, enforces this.
- These complete-tree loads omit **skip, take, requireTotalCount and requireGroupCount**. Group-summary-only loads additionally contain inactive `totalSummary:[]`. The adapter omits inactive fields as in Phase 8A.
- Default caching makes page, page-size and loaded-group collapse/expand local: no additional store load. `cacheEnabled:false` repeats a **whole-tree** request for these actions, still without skip/take. The grouped example keeps native caching enabled. Group headers and repeated continuation headers occupy page slots; this is not row OFFSET/LIMIT or server group paging.
- Explicit public DataSource pagination/count settings can send skip/take and both count flags, with missing group descriptor defaults. That is distinct from normal DataGrid output and does not justify group slicing here. The narrow public wire requires explicit descriptor Booleans; grouped skip/take is rejected, including explicit zero skip, rather than ignored or applied to rows.
- Native expanded nodes need only `key`, `items`, and requested positional `summary`. No `count` is required. Native can consume lazy `items:null,count` and issue extra flat filtered leaf requests, but Phase 8B rejects that response before DevExtreme sees it.
- String `calculateGroupValue` emits that string selector; function `calculateGroupValue` emits an actual function selector (silently lost by JSON). Reject function selectors. Ordinary date DataGrid grouping does not emit groupInterval, even with header-filter intervals configured. Explicit DataSource intervals are outside this contract and reject.
- `autoExpandAll:false` and `column.autoExpandGroup:false` cannot be identified from the final-level flag alone. Validate resolved native configuration before loads and on relevant option changes; both configurations remain unsupported.

Additional retained probes after transport implementation brought native coverage to 27 tests: initially ungrouped grids and removal of the last group (both clearGrouping and groupIndex=-1) omit groupSummary, keep configured summary presentation, and resume flat skip/take/requireTotalCount. Explicit grouped-column sortIndex/sortOrder still do not duplicate those columns into ordinary sort. No contract adjustment was needed.

## 2. Native keys and reference-backend decisions

- Exact string identity: `UK` and `uk` are separate groups. Native ordering compares them case-insensitively and preserves encounter order for ties (which secondary sorting can affect).
- Native ascending fixture keys `[null,"DE","UK","uk","US"]`; descending `["US","UK","uk","DE",null]`.
- Backend explicitly uses binary string grouping identity, lowercase primary string ordering, and a fixed binary ascending tie-break between distinct case-equivalent keys. This deliberate deterministic tie-break may differ from native encounter-order ties; document it, do not claim arbitrary locale/Unicode collation parity. SQLite lower is ASCII-limited, as already qualified for Phase 7 filtering. No data is merged by case.
- Integers sort numerically. Booleans retain `false/true` JSON keys, ascending false first. Dates sort chronologically; native Date keys serialize to timestamp strings, but reference SQL DATE keys serialize to **YYYY-MM-DD** via explicit date-only conversion/Pydantic. No intervals.
- NULL is its own group, first ascending/last descending, and included in SQL top-level group counting. Customer age is nullable; other current keys are non-null.

## 3. Public transport and validation (issue sections 10–23, 55–57)

```ts
interface GetGridGroupDescriptor {
  selector: string;
  desc: boolean;
  isExpanded: boolean;
}
type GetGridGroupKey = string | number | boolean | null;
interface GetGridGroupItem<RecordType extends RaRecord = RaRecord> {
  key: GetGridGroupKey;
  items: Array<RecordType | GetGridGroupItem<RecordType>>;
  summary?: GetGridSummaryValue[];
}
```

Add `group?: GetGridGroupDescriptor[]`, `groupSummary?: GetGridSummaryDescriptor[]`, `requireGroupCount?: boolean` to GetGridLoadOptions; keep flat fields unchanged. Widen data deliberately to `RecordType[] | GetGridGroupItem<RecordType>[]` and add optional groupCount, retaining totalCount/total summary. No null items or group-page/expansion state types. Export new contracts.

`MAX_GROUP_LEVELS=4` on both sides bounds recursion and summary-query depth (at most four per-depth aggregate statements). This permits useful multi-dimensional admin grouping without suggesting unbounded response safety: all records are still transferred. Existing 32-item bound applies independently to total/group summaries. Reuse the same summary descriptor grammar, ordered duplicates and scalar rules; do not create another aggregate DSL.

Normalization accepts explicit native descriptor objects, validates string/nonblank selectors, Boolean fields, unsupported own keys, depth, and parent expansion flags. Preserve final false. Reject functions, intervals, grouped skip/take, active groupSummary without active group, and true requireGroupCount without group. Inactive null/empty group and summary collections are absent. False requireGroupCount can be inactive without grouping; non-Booleans reject.

Store response validation uses **normalized requested depth**, not key/items names to infer depth. At each requested group level require JSON scalar key and dense items array; descend into groups until exactly the leaf level then require records with valid canonical IDs. No array holes, functions, non-finite keys, Date objects, null items or wrong-depth nodes. Records may have legitimate key/items fields; canonical record validation is separate from group levels. Validate every group's positional summary with the Phase 8A scalar/length rules, including duplicates and sparse arrays. Reject unsolicited group summaries and unsolicited non-undefined groupCount. Requested groupCount is a finite non-negative integer; totalCount retains its existing contract. Total and group summary values are independent.

Required regressions include one-level false, true/false, true/true/false accepted; false/false and true/false/false rejected, plus all user-specified wrong-shape/key/count/summary/null-items and type tests.

## 4. Native remote UI (issue sections 24–31)

Derive safe grouping options from native Grouping with `autoExpandAll?: true`, expose native groupPanel presentation (hidden by default), permit contextMenuEnabled, use ordinary Column groupIndex and native GroupItem summary components. No adapter GroupPanel or React grouping state. Exclude sortByGroupSummaryInfo and its React aliases. Expose group-summary presentation from native SummaryGroupItem with the same built-in/column/skipEmptyValues constraints as total items. Preserve alignByColumn, showInGroupFooter, formats and customizeText.

Explicit remote matrix: paging/sorting/filtering/grouping/summary true, groupPaging false. Default autoExpandAll true; reject false on initialization, relevant imperative/nested changes and pre-load. Focused validation additionally checks column.autoExpandGroup, functional calculateGroupValue, group-summary sorting and remote groupPaging. Header Filter remains disabled; no Search Panel, Filter Builder, editing, selection parity or persistence additions. Preserve store identity, existing event/ref composition and defaultPaging behavior.

## 5. Backend architecture (issue sections 32–54, 72–83)

Strict recursive Pydantic v2 wire models: GridGroupDescriptor with explicit string/Boolean values and aliases, complete-list positional parent expansion validation, bounded group list, groupSummary reuse, requireGroupCount Boolean. Preserve existing ungrouped skip/take defaults; distinguish explicitly supplied skip/take for grouped rejection via model_fields_set. GridGroupItem key is strict JSON scalar, items is a non-null recursive array of CustomerRead or groups, optional scalar summary. GridResponse permits flat or grouped arrays and optional camelCase groupCount. Optional fields are emitted only when requested.

All eight Customer fields (id, name, company, city, country, active, age, joined_on) explicitly groupable in the shared registry; capability defaults deny unconfigured grouping. Reject unknown/dotted/dunder/hostile selectors before SQL, with no getattr or dynamic SQL. Reuse the pure summary builder, generalizing its name if necessary using semantic rename tooling. Do not duplicate SQL aggregate dispatch or NULL normalization.

query.py remains execution owner. grouping.py can compile pure group expressions/order, map paths and assemble trees; it owns no sessions/routes. Validate everything before the first SQL statement. Compile the Phase 7 filter **once**, reuse the identical clause for all statements.

SQL strategy:

1. Optional filtered total row COUNT.
2. Optional one whole-filter total aggregate SELECT.
3. Optional SQL top-level group-count subquery (`COUNT(*) FROM (SELECT key ... GROUP BY key)`), including NULL; never nullable COUNT(DISTINCT).
4. If groupSummary active, one aggregate SELECT per prefix depth (GROUP BY country; GROUP BY country,company; etc.). Map rows by the **full group-path tuple**, not final key. Summary duplicates/order remain positional.
5. One complete filtered Customer stream ordered by each group key/direction and explicit null/string tie behavior, then non-group ordinary sorts, then id ASC if not already ordered. Validate even sort descriptors whose fields duplicate grouping; group order wins and redundant/conflicting clauses are omitted. Flat path continues OFFSET/LIMIT unchanged; grouped path never applies either.
6. Python only assembles the already ordered record/key stream into recursive nodes and attaches SQL summary rows. It performs no aggregate calculations. Date keys become date-only strings at the response boundary.

For N group levels: records + optional totalCount + optional totalSummary + optional groupCount + N optional summary SELECTs. With both counts and both summaries: **N+4 statements** (five at one level, six at two), independent of number of groups; without explicit counts/total summaries: N+1. Instrument 50/100 groups to prove no N+1 and identical predicate identity/one compilation. No generic ORM framework.

Reuse Phase 8A semantics: count counts group records even if age NULL; sum=0 for all NULL; avg/min/max=null. Group count means filtered top-level groups, total count means filtered records. Both are supported for explicit provider/HTTP requests even though normal non-group-paged DataGrid does not ask for either.

## 6. Browser example, E2E and favicon (issue sections 58–71)

Keep existing flat resource and its 17 Playwright scenarios. Add separately named Grouped Remote Customers resource using the same endpoint, initial country→company Column groupIndex, visible Group Panel, context menu, native caching, group customer count/average age and total count/average age footer. Do not inject count flags into native requests to manufacture evidence.

Capture true one-/two-level request and full recursive response, visible group rows, membership/order and summary labels, total-footer coexistence, Boolean filtering and group direction changes. Interact with native group UI (context menu/Group Panel), not separate React grouping state. Test collapse/expand under native caching with zero extra requests and complete arrays throughout. Explicit browser fetch of the captured grouping request augmented with count flags separately verifies count semantics if the widget does not send them; distinguish that from automatic UI traffic. Backend/native conformance cover nullable age and date keys; browser dates may be additive if useful. Use deterministic seed expectations independent of server summary results. Strict resource/console checks, screenshots and request/response evidence artifacts.

Add explicit data/empty favicon in the example HTML only. After full tests run a headed Chromium grouped smoke with strict console/resource checks; report evaluation license warnings separately and never suppress unexpected errors.

## 7. Delivery, verification and report (issue sections 90–96)

Follow the user's numbered requirements: native investigation and this saved plan precede source; deliver transport/runtime/native UI, backend grouping/query tests, then grouped example/E2E, docs and end-phase architecture review. Test core positive/negative paths proportionately and retain native probes. Update root README minimally and example README comprehensively, without rewriting PRD. Only mark 8B complete after verification, set 8C next and leave original Phase 8 incomplete.

Run all requested root gates: pnpm install --frozen-lockfile; lint; format:check; typecheck; test; build; build:example; build:remote-fastapi; test:e2e; pack --json. Backend: uv sync --locked --directory examples/remote-fastapi/backend; uv run --directory ... ruff check .; ruff format --check .; pytest. Use PyCharm's configured interpreter/environment preflight. Run IDE build/inspections where supported. Finally git diff --check, git status, git diff. Inspect real package entries/declarations: no examples/backend/E2E/database artifacts. No commit/push/tag/publish, no dependency upgrade or unrelated cleanup.

Create docs/phase-8b-report.md with every requested final report section, actual native probes, statement counts, browser request/response and collapse behavior, exact Vitest/Pytest/Playwright counts and command results, package inspection, limitations, risks, PRD feedback and Phase 8C readiness. Report any known native paging or semantic caveats honestly.

## 8. Explicit Phase 8C boundary

Only complete expanded group trees are supported, regardless of the final descriptor's native Boolean flag. No items:null, lazy server groups, parent expansion state, autoExpandAll=false, column.autoExpandGroup=false, server skip/take over groups, per-group queries/paging, required collapsed-node count, header-filter intervals/distinct requests, or group-summary sorting. Fully expanded grouping may transfer many records; depth/item bounds do not cap leaf cardinality. Phase 8C may widen items to include null and add deliberate group paging without changing Phase 8B's group-key/summary/tree foundation.