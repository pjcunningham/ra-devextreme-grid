# Phase 8A — Remote Total Summaries

Approved implementation design. Execution statuses are maintained in `phase-8a-remote-total-summaries.md`; this document records the approved design and planning probes before source changes.

## Scope

Implement total-summary footers through `DatagridDXRemote → CustomStore → getGrid() → FastAPI → SQLAlchemy` over the complete filtered dataset. Support ordered count/sum/avg/min/max descriptors, duplicates, and selector-less counts. Keep `data: RecordType[]`, totalCount independence, defaultPaging, memoized store identity, existing error handling, Phase 7 filter/date/security rules and Phase 7B CORS/disposable database lifecycle. No grouping, group summaries/count/paging, advanced filter UI, editing, persistence, authentication, generic resources, schema changes, or dependency upgrades. Do not commit, push, tag, publish, or rewrite the PRD.

## Actual DevExtreme 26.1.4 planning probes

Two successful disposable Node/jsdom public-API probes inspected DataGrid, processed CustomStore, paging/filter/sort, option('summary'), getTotalSummaryValue(), footer DOM, and native React Summary/TotalItem children. Evaluation warnings W0019/W0021 occurred. These are planning observations, not implementation or browser-to-FastAPI verification.

Native grid descriptors contain only selector and summaryType, in item order:

```json
[
  { "selector": "id", "summaryType": "count" },
  { "selector": "age", "summaryType": "count" },
  { "selector": "age", "summaryType": "sum" },
  { "selector": "age", "summaryType": "avg" },
  { "selector": "age", "summaryType": "min" },
  { "selector": "age", "summaryType": "max" },
  { "selector": "age", "summaryType": "max" },
  { "summaryType": "count" }
]
```

The last item uses showInColumn without column: raw selector is undefined and JSON omits it. Never invent an id selector. Presentation options (name, displayFormat, showInColumn) do not reach load(). Public LoadOptions allows single descriptor objects and arrays; direct CustomStore.load() preserves both forms. Normalize only these explicit object forms, not shorthand or missing aggregate types. Duplicate descriptors retain positions.

Default skipEmptyValues=true local numeric semantics:

| Ages | count(age) | sum | avg | min | max |
| --- | --- | --- | --- | --- | --- |
| null,20,30,30,40 | 5 | 120 | 30 | 20 | 40 |
| null,0,20,30,30,40 | 6 | 120 | 24 | 0 | 40 |
| null | 1 | 0 | NaN | NaN | NaN |
| empty | 0 | 0 | NaN | NaN | NaN |

Count(id), nullable string, Boolean and date columns also count rows, not non-NULL values. Filtering the six-row fixture to id>3 yields [3,100,33.333333333333336,30,40]. Paging does not change totals. skipEmptyValues=false changes five-row average to 24 and minimum to null, but is not transmitted. Reject false at summary/item level.

Remote undefined avg/min/max deliberately use JSON null rather than NaN; remote null is accepted and shows blank values beside labels, whereas local NaN items disappear. Sum is SQL-coalesced to numeric zero on empty/all-NULL inputs. Preserve precision; formatting belongs to native UI.

With normal caching, page loads can omit totalSummary and retain the footer. With cacheEnabled=false, page-size, page, filter and sort operations send descriptors again. Whole-set totals remain unchanged across paging/sorting and change with filters. Remote custom descriptors reach load(), but calculateCustomSummary is never called, even alongside built-ins. Resolved native React children are visible through option('summary') in onInitialized before the first load. Validate resolved options as well as load descriptors, including callback-only changes and cached loads.

## Public transport

```ts
export type GetGridSummaryType = 'count' | 'sum' | 'avg' | 'min' | 'max';
export type GetGridSummaryDescriptor =
  | { summaryType: 'count'; selector?: string }
  | { summaryType: Exclude<GetGridSummaryType, 'count'>; selector: string };
export type GetGridSummaryValue = string | number | boolean | null;
export interface GetGridLoadOptions {
  skip?: number;
  take?: number;
  requireTotalCount?: boolean;
  sort?: GetGridSortDescriptor[];
  filter?: unknown[] | null;
  totalSummary?: GetGridSummaryDescriptor[];
}
export interface GetGridResult<RecordType extends RaRecord = RaRecord> {
  data: RecordType[];
  totalCount?: number;
  summary?: GetGridSummaryValue[];
}
```

Export new types from src/index.ts. Normalize fresh descriptors, preserving order, duplicates and exact selector text. Reject malformed/extra keys, explicit null or blank selectors, executable selectors/values, missing/custom/unknown types. Count alone may omit/undefined its selector. Absent/null/empty collections are inactive. MAX_SUMMARY_ITEMS=32 on both sides bounds aggregate expression cost; duplicates consume slots. Keep active group/groupSummary/requireGroupCount rejections and existing rules.

Requested summary results must be arrays exactly matching descriptor count. Validate every position including sparse holes: only null, strings, booleans and finite numbers. Reject undefined, functions, symbols, bigint, dates, objects, nested arrays, NaN/infinity. Reject unsolicited non-undefined summary. Forward valid arrays unchanged; omit unrequested optional fields. Preserve data/count validation and provider error identity.

## Native Summary configuration

Derive DatagridDXRemoteSummaryOptions from native Summary and SummaryTotalItem. Omit calculateCustomSummary, groupItems and editing recalculation configuration; narrow total-item summaryType to required GetGridSummaryType and skipEmptyValues to omitted/true at both levels. Preserve formatting, customizeText, alignment, names, showInColumn and other presentation options. Native Summary/TotalItem children remain supported without private metadata inspection or adapter-specific components.

Add small internal summaryOptions.ts validator for resolved public option('summary'). Validate initialization, summary option changes and a stable internal createGridStore pre-load callback. Reject callbacks/custom types, active groups, excessive items, unsupported empty-value overrides and malformed semantic settings, not harmless formatting functions. Compose consumer events/refs and retain instance in ref; preserve store identity and paging.

Explicit remote operations: paging/sorting/filtering/summary=true, grouping/groupPaging=false. Keep advanced UI disabled and native loading/error behavior.

## Backend models and registry

GridSummaryType is Literal['count','sum','avg','min','max']; MAX_SUMMARY_ITEMS=32. GridSummaryDescriptor uses ConfigDict(extra='forbid', populate_by_name=True, strict=True), selector: str|None=None and summary_type alias summaryType. Presence-aware validation allows omission only for count; explicit null/blank invalid. HTTP totalSummary is an optional bounded list (not a single object). GridResponse.summary is optional list[JsonValue]. Preserve response_model_exclude_unset=True and construct optional fields only when requested, retaining null customer fields and null summary positions.

Extend immutable GridField with default-deny summary_types frozenset. The shared registry remains the only selector trust boundary:

| Field type | count | sum | avg | min | max |
| --- | --- | --- | --- | --- | --- |
| INTEGER (id,age) | yes | yes | yes | yes | yes |
| STRING (name,company,city,country) | yes | no | no | no | no |
| BOOLEAN (active) | yes | no | no | no | no |
| DATE (joined_on) | yes | no | no | no | no |

Every supplied selector, even count, resolves through the registry and capability checks. Selector-less count is the explicit row-count exception. Reject hostile/unknown selectors without sanitizing.

## Pure expression builder and centralized execution

summaries.py must have no FastAPI, Session, Customer or SQL execution dependencies:

```python
def build_total_summary_expressions(
    descriptors: Sequence[GridSummaryDescriptor],
    fields: Mapping[str, GridField],
) -> list[ColumnElement[Any]]:
    ...
```

Validate each descriptor and limit. Fixed dispatch: count→func.count() after validating any selector; sum→func.coalesce(func.sum(field.expression),0); avg/min/max→their fixed SQLAlchemy functions. No dynamic func client names, SQL text, selector sanitization, result dictionaries or deduplication. SQL coalescing removes the need for metadata; only add minimal frozen metadata if retained tests establish a need.

query.py remains the sole execution owner: compile filter once; build/validate sorting and ID tie-breaker; build all summaries; only then execute optional filtered count, one aggregate SELECT, and records SELECT. Use explicit select_from(Customer) even for selector-less count to avoid table-free count=1. Reuse identical filter clause in all three statements. Aggregates have no order, offset or limit. Use row-returning SQLAlchemy select/execute so a single descriptor remains a one-element list. Return (records,total_count,summary), update main.py and tests. No Python aggregation or count reuse optimization.

## Example, documentation and evidence

Add native id count and age avg/min/max children with labels and client-side number formatting. Forward optional summary in frontend dataProvider, preserving date normalization and 422 parsing. Extend E2E helper wire types and tests/e2e/summary.spec.ts without restructuring Playwright/database lifecycle. Establish seed expectations independently; verify initial request/response/footer; UK Filter Row request and rows; 10→5 page size and navigation including filtered state; multi-sort invariance; clearing; zero-row zero/null/blank footer; one HTTP request rather than one per item. Capture actual filtered/sorted request, response and footer evidence. Cover the 16-item Section 77 smoke checklist with actual observations or explicit limitations.

Update example README contracts/capabilities/NULL/empty/count independence/one-query/limit/native usage, root roadmap (8A implemented, 8B next, 8C deferred). Create docs/phase-8a-report.md covering every Section 84 category: implementation, native investigation, exact public and Pydantic models, runtime guards, normalization/results, capability table, NULL/empty/filter/page/sort/count semantics, executed SQL and browser evidence, changed files/tests, exact test counts and gate results, package inspection, regressions, deviations, limitations, risks, PRD feedback and 8B readiness.

## Sequential delivery

1. Ordered transport and retained native/normalization/store/type tests.
2. Safe Summary props/children and public lifecycle/runtime guard tests.
3. Backend models, registry, pure builder and security/boundary tests.
4. Query integration, semantic/filter/page/sort/count independence and executed SQL instrumentation tests.
5. Browser example, E2E evidence, docs, complete verification and reviews.

## Validation requirements

Retain public-API native probes in remoteSummarySemantics.test.tsx covering exact descriptors, duplicates, selector-less count, all recorded local/remote semantics, filtering, cached/uncached paging, sorting, ignored callbacks and child initialization. Extend remoteLoadOptions/createGridStore/remoteTypes/export tests for all valid/invalid shapes, 32/33 limits, sparse/JSON-safe results and grouping/flat-data regressions. Actual-instance tests cover all operation flags, native props/children, callback/type/group rejection before provider invocation, dynamic changes, consumer handlers/refs, store identity and paging persistence.

Backend models/fields/builder/query/API tests cover all literals, alias/extra/presence/limit rules; hostile age; DROP TABLE customer, __dict__, customer.age, password_hash; unsupported field pairs; deterministic null/zero/duplicate/empty/nonintegral fixtures; single count without selector; duplicate/out-of-order [age max,id count,age avg,age min]; UK and nested filtering, take=5, beyond-last paging, ASC/DESC/multi-sort; true/false/omitted totalCount; inactive omission. Instrument real SQLAlchemy execution after seeding: five descriptors→one aggregate, two SELECTs without totalCount or three with it, inactive adds none, explicit Customer FROM/no ordering/paging, filter compiled once and identical clause reused, invalid structure→zero statements. Inspect structure and execution events, not brittle full SQL snapshots.

Run every gate and record fresh results, not historical 369/1519/13 counts:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm build:example
pnpm build:remote-fastapi
pnpm test:e2e
pnpm pack --json
uv sync --locked --directory examples/remote-fastapi/backend
uv run --directory examples/remote-fastapi/backend ruff check .
uv run --directory examples/remote-fastapi/backend ruff format --check .
uv run --directory examples/remote-fastapi/backend pytest
git diff --check
git status
git diff
```

Use configured Python environment. Inspect actual package and declarations; no backend/example/E2E/database files in package. Complete security and architecture reviews. Numeric SQLite overflow/JavaScript precision limits remain; no Decimal/bigint serialization. Remote null footer differs from local NaN. Native JSX requires runtime protection. No grouping implementation: assess builder/capability/type reuse for Phase 8B only.
