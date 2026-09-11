---
sessionId: session-260911-134035-17ml
---

# Requirements

### Goal
Implement **Phase 8A only**: native DevExtreme total-summary footers backed by aggregates over the **complete filtered dataset**, through the existing `DatagridDXRemote → CustomStore → getGrid() → FastAPI → SQLAlchemy` path.

### Required outcomes
- Support ordered `count`, `sum`, `avg`, `min`, and `max` descriptors, including duplicate positions and native selector-less counts.
- Add typed `totalSummary` requests and positional `summary` responses without changing `data: RecordType[]`.
- Support safe native `summary` props and `<Summary><TotalItem /></Summary>` children; formatting remains client-side.
- Validate every sort, filter, and summary before executing SQL. Multiple summaries use **one aggregate SELECT**, with the existing filter clause reused and no ordering or paging.
- Keep `totalCount` independently requested and calculated.
- Demonstrate customer count and age average/minimum/maximum in the real FastAPI example, with request, response, footer, and SQL execution evidence.

### Scope boundaries
No grouping, group summaries, `groupCount`, group paging, Header Filter, Search Panel, Filter Builder, inline editing, persistence, authentication, generic resource abstraction, schema changes, or dependency upgrades. Preserve Phase 7 date-only transport, nullable-NOT policy, case-insensitive comparisons, LIKE escaping, and complexity limits. Preserve Phase 7B CORS and disposable E2E database setup.

### Planning status
The requested prior plans and reports, current implementation, native typings, and test patterns have been inspected. Git is clean. Disposable public-API DevExtreme probes ran without project-file changes; no implementation or full verification suite has run in this planning session.

During implementation, save this approved design and probe findings to `.junie/plans/011-phase-8a-remote-total-summaries.md` **before changing source**. Finish with `docs/phase-8a-report.md`, documenting actual results rather than treating historical test counts as current evidence. Do not commit, push, tag, publish, or silently rewrite the PRD.

# DevExtreme Findings

### Investigation performed
Two successful disposable Node/jsdom probes used installed **DevExtreme 26.1.4**, public `DataGrid`, processed `CustomStore`, `option()`, `filter()`, paging methods, `getTotalSummaryValue()`, DOM footer inspection, and native React `Summary`/`TotalItem` components. Known evaluation-license warnings occurred. These are native-runtime observations, **not yet browser-to-FastAPI verification**.

### Native request shape
A native grid emits an **array of objects** containing only `selector` and `summaryType`:
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
- The last item came from a count with `showInColumn="id"` but no `column`. Its raw descriptor has `selector: undefined`; JSON omits that key. Do not invent `selector: "id"`.
- Descriptor order matches item order. Duplicate maximum descriptors retain both positions.
- Presentation properties such as `name`, `displayFormat`, and `showInColumn` do not reach `load()`.
- Public `LoadOptions` in `devextreme/common/data` permits a single descriptor or an array; direct public `CustomStore.load()` probes preserve both forms. Normalize these explicit object forms into arrays. Do not add string shorthand or infer an omitted aggregate type.

### Observed local semantics
Default `skipEmptyValues: true`:

| Dataset of ages | `count(age)` | `sum` | `avg` | `min` | `max` |
| --- | ---: | ---: | ---: | ---: | ---: |
| `[null, 20, 30, 30, 40]` | 5 | 120 | 30 | 20 | 40 |
| `[null, 0, 20, 30, 30, 40]` | 6 | 120 | 24 | 0 | 40 |
| `[null]` | 1 | 0 | `NaN` | `NaN` | `NaN` |
| Empty filtered result | 0 | 0 | `NaN` | `NaN` | `NaN` |

`count(id)` also counts all rows. Additional count probes over string, Boolean, and date-valued columns, including NULLs, likewise returned the row count. Numeric sum/average/minimum/maximum skip NULLs by default; zero and duplicates participate normally. Filtering the six-row dataset to IDs greater than three produced `[3, 100, 33.333333333333336, 30, 40]` in count/sum/avg/min/max order. Paging did not change local totals.

### Deliberate remote semantics
- Use row count, **not `COUNT(nullable_column)`**, for count summaries.
- Normalize empty/all-NULL sums to numeric `0`.
- Represent undefined average/minimum/maximum as JSON `null`, never `NaN` or strings. A processed remote response containing nulls is accepted by DevExtreme and renders blank values beside the default labels; local NaN items were hidden entirely. Document this small display difference rather than claim identical DOM output.
- Preserve raw numeric precision; apply formatting only through native UI options.

### Remote loading and configuration observations
- With normal caching, page navigation can omit `totalSummary` while the footer retains previous totals. Do not require summaries on every request.
- With `cacheEnabled={false}`, as in the existing FastAPI example, page-size changes, page navigation, filtering, and sorting sent descriptors again. Supplied whole-dataset totals remained unchanged for paging/sorting and changed after filtering.
- Remote `summaryType="custom"` reaches `load()` as `summaryType: "custom"`, but `calculateCustomSummary` was **never called**, including when installed alongside built-in items. Load validation alone cannot detect the silently ignored callback.
- Native React Summary children were fully resolved through `option('summary')` in `onInitialized`, before the first store load. This provides a public-API validation point without inspecting private React configuration metadata.
- `skipEmptyValues: false` changes local semantics: on the five-row dataset, average became 24 and minimum became null. It is not transmitted in summary descriptors. Phase 8A therefore supports the default semantics only and rejects false at summary/item level rather than suggesting the backend honors it.

# Technical Design

### Existing extension points
- `src/remote/types.ts`: currently flat records plus optional `totalCount`.
- `src/remote/loadOptions.ts`: rejects active summaries; preserves native filters and dates while rejecting executable query functions.
- `src/remote/createGridStore.ts`: processed store, `key: 'id'`, wrapped React-Admin provider integration, data/count validation.
- `src/DatagridDXRemote.tsx`: memoizes the store by resource/provider and uses `defaultPaging`; keep both lifecycle guarantees.
- `app/grid/fields.py`, `filtering.py`, and `query.py` under `examples/remote-fastapi/backend`: shared immutable field metadata, pure filter compiler, and centralized query execution.
- `examples/remote-fastapi/frontend/src/dataProvider.ts` already spreads request load options, but currently **drops all response fields except data/count**. Summary forwarding must be added there too.

### Public TypeScript contract
Export through `src/index.ts`:
```ts
export type GetGridSummaryType = 'count' | 'sum' | 'avg' | 'min' | 'max';

export type GetGridSummaryDescriptor =
  | { summaryType: 'count'; selector?: string }
  | {
      summaryType: Exclude<GetGridSummaryType, 'count'>;
      selector: string;
    };

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
The scalar result type permits JSON-safe future date strings without exposing field-specific rules in the adapter. Runtime checks restrict numbers to finite values. No grouped record union, group requests, or group counts are introduced; Phase 8B owns that deliberate widening.

### Normalization and result validation
In `src/remote/loadOptions.ts`:
- Accept explicit native descriptor objects singly or in arrays; produce fresh typed objects without mutating input.
- Preserve order and duplicates. Require a supported literal type and a nonblank string selector except for omitted/undefined selector on count.
- Reject explicit null selectors, function selectors, custom/unknown types, missing types, extra descriptor keys, malformed objects, and executable values. Preserve valid selector text unchanged for backend resolution; do not sanitize hostile names.
- Use `MAX_SUMMARY_ITEMS = 32`. This comfortably exceeds the example's four items while bounding aggregate-expression cost; duplicates consume slots. Keep an identical backend constant, with boundary tests and documentation rather than a configuration subsystem.
- Treat absent/null/empty native summary collections as inactive and omit `totalSummary`, preserving the existing empty-array behavior.
- Continue rejecting active `group`, `groupSummary`, and `requireGroupCount`; retain other unsupported-operation and sort/filter/paging rules.

In `src/remote/createGridStore.ts`:
- A nonempty normalized summary request requires `result.summary` to be an array with exactly the same length.
- Validate every position, including sparse-array holes: allow strings, booleans, null, and finite numbers; reject undefined, functions, symbols, bigint, Dates, objects, nested arrays, NaN, and infinities. Do not validate values against particular fields or aggregates.
- Reject an unsolicited non-undefined `summary` when no summaries were requested. This keeps the response tied to its request and avoids stale positional data.
- Forward validated `summary` unchanged into `LoadResultObject.summary`; omit absent optional fields. Preserve existing data/count validation and provider error identity.

### Safe native Summary configuration
In `src/types.ts`, reintroduce `summary?: DatagridDXRemoteSummaryOptions`, derived from native `Summary`/`SummaryTotalItem` types in `devextreme/ui/data_grid`:
- Omit `calculateCustomSummary`, `groupItems`, and editing-only recalculation configuration.
- Replace the native total-item `summaryType` string escape hatch with `GetGridSummaryType`; require an explicit supported type.
- Permit only omitted/true `skipEmptyValues` at summary and item level. Keep native presentation options, including `displayFormat`, `valueFormat`, alignment, names, `showInColumn`, and display-only `customizeText` callbacks.
- Export the safe summary-options type; retain all existing unsupported top-level prop omissions.

Add a small internal validator in `src/remote/summaryOptions.ts`. Validate the resolved public `option('summary')`, covering props, native nested children, and later option changes. Reject custom callbacks/types, active group items, excessive item counts, unsupported empty-value overrides, and malformed semantic settings. Do not serialize or reject harmless display-only formatting functions.

Compose public initialization/summary-option-change handlers in `DatagridDXRemote`, retain the public grid instance in a ref, and add a stable internal pre-load validation callback to `createGridStore` before `getGrid()` is called. This also blocks invalid settings during cached page loads that omit descriptors. Validate callback-only changes even if DevExtreme does not reload. Preserve consumer event/ref behavior and store identity; do not introduce an adapter-specific Summary component or inspect private child metadata.

Set the actual grid's operations explicitly to:
```ts
{ paging: true, sorting: true, filtering: true,
  summary: true, grouping: false, groupPaging: false }
```
Keep `defaultPaging`, disabled advanced UI, and native loading/error handling intact. Nested external JSX cannot be fully restricted by the wrapper's TypeScript type, so runtime validation remains essential.

### Pydantic wire models
Extend `app/grid/models.py` using existing alias/error conventions:
```python
GridSummaryType = Literal['count', 'sum', 'avg', 'min', 'max']
MAX_SUMMARY_ITEMS = 32

class GridSummaryDescriptor(BaseModel):
    model_config = ConfigDict(
        extra='forbid', populate_by_name=True, strict=True
    )
    selector: str | None = None
    summary_type: GridSummaryType = Field(alias='summaryType')

# GridLoadOptions addition

# total_summary: list[GridSummaryDescriptor] | None = Field(

# default=None, alias='totalSummary', max_length=MAX_SUMMARY_ITEMS

# )

# GridResponse addition

# summary: list[JsonValue] | None = None

```
Add presence-aware validation: only count may omit selector; a supplied selector must be a nonblank string, including for count. Explicit null is invalid even though omission is represented internally by None. The HTTP request accepts arrays only, because native single descriptors are normalized before transport. None/empty summary collections are inactive. Retain existing aliases, paging defaults/bounds, strict extra-field rejection, and error envelopes.

Construct response optional fields only when requested, using the existing `response_model_exclude_unset=True` in `app/main.py`. Do not use blanket exclude-none behavior that could remove nullable customer values. Summary elements containing null must remain present.

### Field capabilities: one trust boundary
Extend `GridField` with `summary_types: frozenset[GridSummaryType]`, defaulting to an empty set. Assign explicit reusable capability sets in `CUSTOMER_GRID_FIELDS`; do not maintain a second selector whitelist.

| Field type | count | sum | avg | min | max |
| --- | --- | --- | --- | --- | --- |
| INTEGER (`id`, `age`) | Yes | Yes | Yes | Yes | Yes |
| STRING (`name`, `company`, `city`, `country`) | Yes | No | No | No | No |
| BOOLEAN (`active`) | Yes | No | No | No | No |
| DATE (`joined_on`) | Yes | No | No | No | No |

This conservative policy matches verified row-count semantics and avoids unverified lexical/date extremum contracts. Selector-less count is the explicit row-count exception; every supplied selector, including count selectors, must resolve through the registry and satisfy its capability set. Unknown, dotted, dunder, and SQL-looking selectors raise `GridQueryError` without sanitization.

### Approved backend boundary: pure expression builder
Add `app/grid/summaries.py` with no FastAPI, Session, resource model, or database-execution dependency:
```python
def build_total_summary_expressions(
    descriptors: Sequence[GridSummaryDescriptor],
    fields: Mapping[str, GridField],
) -> list[ColumnElement[Any]]:
    ...
```
It validates every descriptor, enforces the limit, resolves fields/capabilities, and returns ordered expressions using fixed dispatch:
- `count` → `func.count()` for row-count semantics, after validating any supplied selector.
- `sum` → `func.coalesce(func.sum(field.expression), 0)`.
- `avg`, `min`, `max` → their fixed SQLAlchemy functions.

No dynamically resolved `func.<client_input>`, SQL text, selector sanitization, or result dictionary. Repeated descriptors yield repeated expressions. SQL coalescing handles the only required normalization, so a metadata wrapper is unnecessary initially; add a frozen minimal `CompiledSummary` only if retained tests establish a real need.

### Centralized execution in query.py
`execute_customer_grid_query()` remains the single execution owner:
1. Compile the Phase 7 filter once.
2. Validate/build ordered sort clauses and the existing ID tie-breaker.
3. Validate/build all summary expressions.
4. Only after all validation, execute conditional filtered count, one aggregate query when needed, and the filtered/sorted/paged records query.

The aggregate statement is conceptually:
```sql
SELECT COUNT(*), COALESCE(SUM(age), 0), AVG(age), MIN(age), MAX(age)
FROM customer
WHERE <the shared compiled predicate>
```
**Explicitly select from `Customer`**, including a count-only request without a selector or filter; otherwise a table-free count could incorrectly return one. Apply no `ORDER BY`, `OFFSET`, or `LIMIT` to the aggregate statement. Keep `totalCount` a separate conditional query; no count-reuse optimization in this phase.

Use a row-returning SQLAlchemy select/execute path for aggregates so a single descriptor produces a one-element positional result rather than SQLModel's scalar-result shortcut. Convert the row to a list without reordering, formatting, rounding, or Python aggregation over records. Extend the existing internal return tuple to `(records, total_count, summary)` and update `app/main.py` and affected tests; no generic result framework is needed.

### Browser example and documentation
- Add native Summary children in `examples/remote-fastapi/frontend/src/App.tsx`: count ID and average/minimum/maximum age, with client-side labels and numeric formatting. Keep all existing columns/filter settings and `cacheEnabled={false}`.
- Forward optional response `summary` in `frontend/src/dataProvider.ts`; retain date normalization and 422 parsing.
- Extend `tests/e2e/helpers.ts` request/response types and add summary-focused browser scenarios without restructuring `playwright.config.ts` or database lifecycle files.
- Update the example README with contracts, capability table, positional/filtered semantics, NULL/empty behavior, count independence, single-query design, limits, and native UI usage. Update root README minimally: Phase 8A implemented, Phase 8B next, Phase 8C deferred.
- Create `docs/phase-8a-report.md` with actual native findings, exact final types/models, SQL and browser evidence, changed files/tests, exact counts and command results, package inspection, regressions, deviations, limitations, PRD feedback, and Phase 8B readiness. Do not claim implementation-era evidence from planning probes.

### Risks and mitigations
- Remote callbacks can be silently ignored: validate resolved configuration and recheck before provider calls.
- Summary caching changes request shape: cover cached adapter operation and uncached example operation separately.
- NULL and empty-set behavior differs from raw SQL/local NaN display: use deliberate zero/null normalization and test footer output.
- Single-expression scalar results and selector-less FROM inference can corrupt positional results: add dedicated regressions.
- Native JSX remains broadly typed: runtime safeguards cover it without replacing native components.
- Large integer sums retain SQLite overflow/JavaScript numeric-precision limits; do not introduce Decimal/bigint serialization or stringify numeric results. Document these limits.
- Reuse the expression builder and capabilities later, but leave grouping mechanics and public grouped records entirely to Phase 8B.

# Validation

### Native and frontend coverage
Add retained public-API tests in `tests/remoteSummarySemantics.test.tsx`, following the existing real-grid/jsdom pattern in `remoteFilteringSemantics.test.tsx`. Cover all recorded semantics, descriptor keys/order/duplicates, selector-less count, local and remote NULL/empty behavior, filtering, cached/uncached paging, sorting, ignored custom callbacks, and native React child resolution.

Extend:
- `tests/remoteLoadOptions.test.ts`: single object/array normalization; unchanged inputs; missing/blank/null/function selectors; custom/unknown/missing types; malformed/extra fields; inactive collections; 32/33 limits; preserved group rejections and sort/filter/date behavior.
- `tests/createGridStore.test.ts`: positional forwarding; missing, non-array, wrong-length, unsolicited, sparse, or non-JSON-safe summaries; valid zero/null/negative/fractional scalar values; unchanged data/count/error behavior.
- `tests/remoteTypes.test.tsx` and export tests: exact new public types, count-only selector omission, invalid literal/function types, safe summary props, unchanged flat data, and grouping omissions.
- `tests/DatagridDXRemote.test.tsx`: inspect the actual public instance's operations, native Summary props/children, runtime callback/type/group-item rejection before provider invocation, dynamic configuration changes, caller events/refs, stable store identity, and paging persistence.

### Backend models, security, and aggregate semantics
Extend `test_grid_models.py`, `test_grid_fields.py`, `test_grid_query.py`, and `test_api.py`; add `test_grid_summaries.py` for the pure builder and focused deterministic aggregate fixtures.
- Validate camelCase aliases, all five literals, selectors/extra fields, 32/33 limits, duplicates, and unchanged existing aliases/OpenAPI contracts.
- Test `age; DROP TABLE customer`, `__dict__`, `customer.age`, `password_hash`, custom types, and unsupported field/aggregate pairs. Supplied count selectors must still be validated.
- Exercise all five aggregates over nullable/zero/duplicate values, all-NULL and empty sets, non-integral averages, one descriptor, selector-less count, and duplicate/out-of-order descriptors. Include `[age max, id count, age avg, age min]` explicitly.
- Verify UK filtering and a nested Phase 7 filter, full-filtered totals with `take=5`, ASC/DESC and multi-sort independence, paging beyond the final page, and all true/false/omitted `requireTotalCount` combinations.
- Verify absent/inactive summaries omit the response property; requested summaries work without `totalCount`.

### Executed SQL evidence
Build on the existing filter-compilation and statement instrumentation tests. Attach lightweight SQLAlchemy execution listeners around real request/query execution, after fixture seeding:
- Five descriptors execute one aggregate statement, not five.
- Summary plus records requires two SELECTs, or three when `totalCount` is requested; inactive summaries add none.
- Summary SQL has a Customer FROM clause and no ordering/offset/limit.
- Compile the filter once and verify the same clause object is reused for count, summaries, and records.
- Invalid sort/filter/summary structure executes zero query statements.
- Inspect statement structure and captured execution events, not brittle complete SQL snapshots. Do not claim proof from source inspection alone.

### Complete browser round trip
Add summary scenarios in `tests/e2e/summary.spec.ts`, reusing existing helpers and the isolated 100-row database:
1. Initial request descriptors, ordered response values, and rendered footer agree with independently established seed expectations.
2. Apply `country = UK` through the real Filter Row: both request fields appear, response totals change, footer updates, and visible rows are UK-only.
3. Change page size 10 → 5 and move pages, including while filtered; totals describe the complete filtered dataset, not five visible rows.
4. Apply multi-column sorting; totals remain unchanged.
5. Clear filters to restore totals, then apply a zero-row filter and verify documented zero/null response and blank-value footer behavior.
6. Verify no network request is introduced per individual summary descriptor.

Capture at least one actual filtered/sorted request and its response plus visible footer evidence. Retain all previous date, page-size persistence, error/recovery, loading, and CORS tests. Perform an observed real-browser smoke pass covering the task's Section 77 checklist; record each actual result or limitation.

### Required implementation verification
Run all requested gates, recording exact results and passing Vitest/Pytest/Playwright counts; the historical 369/1,519/13 counts are not fresh verification:
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
Use the configured Python environment when running backend tooling. Inspect the actual package contents and emitted declarations: no backend, example, E2E, or database files may enter the npm package. Complete the task's security and architecture reviews, fix Phase 8A defects, and report all Section 84 categories with actual evidence. Grouping remains deferred.

# Delivery Steps

### ✓ Step 1: Implement the ordered summary transport contract
The package accepts validated native total-summary requests and returns validated positional summaries.
- Save the approved plan and native probe findings to `.junie/plans/011-phase-8a-remote-total-summaries.md` before source changes.
- Extend `src/remote/types.ts` and `src/index.ts` with narrowed descriptor/value types and optional request/result fields.
- Update `loadOptions.ts` for single-object/array normalization, selector-less counts, order/duplicates, strict validation, and the 32-item limit.
- Update `createGridStore.ts` for required positional result validation and forwarding, including the documented unsolicited-summary policy.
- Add retained native probes and normalization/store/type tests; preserve existing unsupported-operation and data/count regressions.

### ✓ Step 2: Expose and guard native remote Summary configuration
DatagridDXRemote supports native Summary props and children without accepting unsupported client aggregation.
- Derive safe native summary types in `src/types.ts` and add the focused `src/remote/summaryOptions.ts` validator.
- Compose public grid lifecycle handlers and a stable pre-load guard to reject callbacks, custom types, group summaries, and unsupported empty-value overrides before provider calls.
- Enable only `remoteOperations.summary`; keep grouping/groupPaging false and existing advanced UI disabled.
- Preserve refs, consumer events, memoized store identity, `defaultPaging`, native loading, and error behavior.
- Extend actual-instance tests for props/children, dynamic invalid settings, cached paging, operation flags, and lifecycle regressions.

### ✓ Step 3: Implement strict backend summary models and pure compilation
The backend validates bounded descriptors and builds ordered fixed SQL expressions without executing queries.
- Add `GridSummaryDescriptor`, aliases, the 32-item limit, and optional response summary to `app/grid/models.py`.
- Extend `GridField` and `CUSTOMER_GRID_FIELDS` with explicit default-deny summary capabilities.
- Add session-independent `app/grid/summaries.py` with registry resolution, capability checks, fixed aggregate dispatch, row-count semantics, and SQL-side sum coalescing.
- Preserve duplicate positions and avoid unnecessary metadata or selector-keyed results.
- Add model, registry, pure-builder, hostile-selector, unsupported-type, and boundary tests.

### ✓ Step 4: Integrate whole-filtered-set aggregates into query orchestration
Each valid summary request executes one aggregate SELECT over the shared filtered dataset.
- Update `app/grid/query.py` to compile the filter once and complete sort/filter/summary validation before any SQL.
- Execute optional totalCount, one explicit-FROM aggregate statement without sort/paging, and the normal deterministic records query.
- Use a row-returning aggregate execution path that handles one or many descriptors consistently.
- Extend the internal return tuple and `app/main.py` response construction while preserving omitted optional fields and nullable record values.
- Add deterministic semantic/filter/page/sort tests and executed-SQL instrumentation proving statement counts, shared predicate identity, and zero queries for invalid structure.

### ✓ Step 5: Deliver the FastAPI footer example and end-to-end evidence
The real browser example displays verified remote totals and documents the completed Phase 8A contract.
- Add native count/average/minimum/maximum Summary items to `frontend/src/App.tsx` and forward response summaries in `frontend/src/dataProvider.ts`.
- Extend E2E helper contracts and implement full request/response/footer checks for initial load, UK filtering, clearing, empty results, paging, multi-sort, and request counts.
- Preserve the current Playwright configuration, CORS, disposable database lifecycle, and existing regression suite; perform the observed browser smoke checklist.
- Update the example README and root roadmap, then create `docs/phase-8a-report.md` with actual native, SQL, browser, security, and architecture evidence.
- Run every required verification command, inspect package contents and declarations, record exact test counts/results and limitations, and assess Phase 8B readiness without starting it.