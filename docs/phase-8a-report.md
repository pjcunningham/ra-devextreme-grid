# Phase 8A — Remote Total Summaries

## Implementation summary

Implemented Phase 8A only: native DevExtreme total-summary footers through `DatagridDXRemote → processed CustomStore → dataProvider.getGrid() → HTTP → FastAPI → SQLAlchemy`. The transport is backend-agnostic and positional; the reference backend aggregates the **complete filtered dataset** in SQL. Records remain `RecordType[]`. No grouping mechanics, dependency upgrades or schema changes were introduced.

The approved design and planning probes were saved before source edits in [011-phase-8a-remote-total-summaries.md](../.junie/plans/011-phase-8a-remote-total-summaries.md). Execution tracking is in the separate approved delivery plan. This report distinguishes retained implementation tests from the earlier disposable probes.

## DevExtreme summary investigation

Installed DevExtreme and native React components: **26.1.4**. Two successful planning probes used public DataGrid/CustomStore methods in Node/jsdom. Implementation retained **21 public-API native tests** in `tests/remoteSummarySemantics.test.tsx`, not private React metadata. They verify:

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

- Grid-generated descriptors are arrays containing only selector/type keys. Names, formats and placement are presentation-only.
- A count with `showInColumn` but no `column` has raw `selector: undefined`; JSON omits the key. No selector is invented.
- Public `LoadOptions` supports a single explicit object or an array; direct CustomStore probes retain either form. Installed native declarations nevertheless require a selector where runtime permits selector-less count. Tests document that assertion boundary; the public adapter type models runtime accurately.
- Descriptor order and duplicate positions survive. No descriptor deduplication is performed.
- `count` counts **all rows**, including NULL values, across numeric/string/Boolean/date columns. It is not SQL `COUNT(nullable_column)`.
- Filtering changes totals; page size, page navigation and sorting do not change whole-set totals.
- Cached paging can omit `totalSummary` and retain the footer. Uncached paging/sorting resend descriptors. The FastAPI example retains `cacheEnabled={false}`.
- Remote custom descriptors reach `load()`, but `calculateCustomSummary` is never invoked, including callback-only changes. Load validation alone would silently miss that callback.
- Native React Summary children are resolved through public `option('summary')` in initialization before first loading.
- `skipEmptyValues=false` is not transmitted, yet changes local semantics (five-row average becomes 24; minimum becomes null). Phase 8A rejects this override.

### Verified NULL, zero, duplicate and empty behavior

Default native local semantics:

| Ages                   | count(age) | sum | avg | min | max |
| ---------------------- | ---------- | --- | --- | --- | --- |
| `[null,20,30,30,40]`   | 5          | 120 | 30  | 20  | 40  |
| `[null,0,20,30,30,40]` | 6          | 120 | 24  | 0   | 40  |
| `[null]`               | 1          | 0   | NaN | NaN | NaN |
| Empty filtered result  | 0          | 0   | NaN | NaN | NaN |

The backend intentionally returns JSON `null` for undefined avg/min/max, and numeric zero for empty/all-NULL sums. SQL skips NULLs for numeric aggregates; zeros and duplicates participate. Filtering the six-row fixture to IDs above three yields `[3,100,33.333333333333336,30,40]`. No rounding or stringification occurs in transport.

Native remote null values render blank values beside labels; native local NaN items disappear. This small display difference is deliberate and tested, not claimed as identical DOM parity. An empty example footer should show `Customers: 0`, `Average age:`, `Minimum age:`, `Maximum age:`.

## Exact public TypeScript contract

Exported from `src/index.ts`:

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
  /**
   * Opaque native DevExtreme expression, not a library operator grammar.
   * Providers must narrow unknown values. Dates are preserved; executable values
   * are rejected at runtime. Serialization belongs to the application transport.
   */
  filter?: unknown[] | null;
  totalSummary?: GetGridSummaryDescriptor[];
}

export interface GetGridResult<RecordType extends RaRecord = RaRecord> {
  data: RecordType[];
  totalCount?: number;
  summary?: GetGridSummaryValue[];
}
```

The scalar value type permits future JSON date strings without field-specific adapter semantics. Runtime requires finite numbers. There are no group request fields, grouped record unions, `items`, or `groupCount` additions.

## Remote Summary props and lifecycle

`DatagridDXRemoteSummaryOptions` derives from native `Summary` and `SummaryTotalItem` (aliased as `DxGridSummary`/`DxGridSummaryTotalItem`):

```ts
type DatagridDXRemoteSummaryTotalItem = Omit<
  DxGridSummaryTotalItem,
  'summaryType' | 'skipEmptyValues'
> & {
  skipEmptyValues?: true;
} & (
    { summaryType: 'count' } | { summaryType: Exclude<GetGridSummaryType, 'count'>; column: string }
  );

export type DatagridDXRemoteSummaryOptions = Omit<
  DxGridSummary,
  | 'calculateCustomSummary'
  | 'groupItems'
  | 'recalculateWhileEditing'
  | 'totalItems'
  | 'skipEmptyValues'
> & {
  totalItems?: DatagridDXRemoteSummaryTotalItem[];
  skipEmptyValues?: true;
};
```

Native `<Summary><TotalItem /></Summary>` children remain supported; there is no adapter-specific component or private child traversal. Names, alignment, display/value formats, `showInColumn` and display-only `customizeText` functions remain native.

`validateSummaryOptions()` checks resolved public options at initialization, summary option changes, and through a stable pre-load callback. Thus callback-only changes are rejected even without a reload, and cached descriptor-free loads cannot bypass invalid settings. Native null callback/empty collection defaults and disabled editing recalculation are allowed. Active groups, custom callbacks/types, malformed/sparse items, excess items and unsupported empty-value overrides fail descriptively.

Consumer initialization, option-change and disposal handlers are composed; the consumer ref is forwarded unchanged. Store identity remains stable across unrelated rerenders and handler changes. The pre-load callback reads the instance ref rather than capturing stale configuration. Existing `defaultPaging` behavior is retained. Native load/error handling is unchanged; configuration errors throw as developer errors rather than inventing successful empty results.

Actual-instance tests assert:

```ts
{ paging: true, sorting: true, filtering: true,
  summary: true, grouping: false, groupPaging: false }
```

Advanced UI remains disabled. This is focused Summary validation, not a general sandbox for arbitrary imperative native configuration.

## Load normalization and CustomStore mapping

`normalizeTotalSummary()` accepts explicit object/array forms, creates fresh objects and preserves selector text/order/duplicates. Count alone may omit/undefined its selector. Missing/unknown/custom types, extra keys, blank/null/non-string/function selectors, malformed objects and sparse positions reject. No string shorthand or inferred aggregate type is added.

Both sides enforce **32 items**. Duplicates consume slots; the bound comfortably exceeds the example's four expressions while bounding per-request aggregate cost. Absent/null/empty collections are inactive. Group/group-summary/group-count rejections, opaque filter preservation, date handling and sort/paging rules remain intact.

A nonempty request requires an exact-length response array. Every position is validated, including holes. Only strings, booleans, null and finite numbers survive; undefined/functions/symbols/bigint/Date/objects/nested arrays/NaN/infinities reject. Unsolicited non-undefined summaries reject. Valid arrays are forwarded unchanged as `LoadResultObject.summary`; absent optional properties are omitted. Data/count validation and provider rejection identity remain intact.

## Backend wire contract

Final additions and response model:

```python
MAX_SUMMARY_ITEMS = 32
GridSummaryType = Literal["count", "sum", "avg", "min", "max"]

class GridSummaryDescriptor(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, strict=True)

    selector: str | None = None
    summary_type: GridSummaryType = Field(alias="summaryType")

    @field_validator("selector", mode="before")
    @classmethod
    def validate_supplied_selector(cls, value: Any) -> str:
        if not isinstance(value, str) or not value.strip():
            raise ValueError("selector must be a nonblank string")
        return value

    @model_validator(mode="after")
    def require_selector_for_non_count(self) -> Self:
        if self.summary_type != "count" and "selector" not in self.model_fields_set:
            raise ValueError("selector is required for non-count summaries")
        return self

# On the existing GridLoadOptions:
total_summary: list[GridSummaryDescriptor] | None = Field(
    default=None, alias="totalSummary", max_length=MAX_SUMMARY_ITEMS, strict=True
)

class GridResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data: list[CustomerRead]
    total_count: int | None = Field(default=None, alias="totalCount")
    summary: list[JsonValue] | None = None
```

HTTP accepts arrays only; native single descriptors are normalized before transport. Both alias and Python field names retain existing conventions. Supplied null selectors reject even for count; omission is represented internally by None. OpenAPI exposes the new alias properties and limit; conditional selector-presence semantics are enforced by validators, not conditional JSON Schema clauses.

`app/main.py` constructs `(records,total_count,summary)` response fields only when requested. Existing `response_model_exclude_unset=True` is retained, not blanket exclude-none. Nullable customer ages and null summary positions remain present. Requested summaries without a count produce `{ "data": [...], "summary": [...] }`; inactive summaries produce no summary property. Validation failures retain HTTP 422 error envelopes.

## Field summary capabilities

`GridField.summary_types` is an immutable default-empty frozenset. Explicit reusable sets are assigned in the **existing** shared registry, with no parallel selector whitelist.

| Field type | Fields                       | count | sum | avg | min | max |
| ---------- | ---------------------------- | ----- | --- | --- | --- | --- |
| INTEGER    | id, age                      | Yes   | Yes | Yes | Yes | Yes |
| STRING     | name, company, city, country | Yes   | No  | No  | No  | No  |
| BOOLEAN    | active                       | Yes   | No  | No  | No  | No  |
| DATE       | joined_on                    | Yes   | No  | No  | No  | No  |

Selector-less count is the explicit row-count exception. Every supplied selector, including count, must resolve and satisfy capabilities. Numeric/date/string extrema beyond the table are not implicitly enabled just because SQLite supports them.

## SQL aggregate design and executed evidence

`summaries.py` is a pure `build_total_summary_expressions(descriptors, fields)` builder with no Session/FastAPI/query execution dependency. It revalidates typed descriptors, resolves capabilities, and uses fixed count/sum/avg/min/max branches. Sum coalescing in SQL is the only required normalization; no metadata framework is needed.

`query.py` compiles the filter once, validates sorting and all summary expressions **before any SQL**, then executes optional count, one summary SELECT, and records. The summary uses `sqlalchemy.select`, explicit `.select_from(Customer)`, and `session.execute(...).one()` followed by `list(row)`. This avoids the SQLModel single-expression scalar shortcut and table-free count=1 trap. Count uses its separate existing execution path; no count-reuse optimization was introduced.

Captured from a real SQLite execution event in `test_filter_compiled_once_and_identical_predicate_reused_in_three_executed_queries`:

```sql
SELECT count(*) AS count_1,
       coalesce(sum(customer.age), ?) AS coalesce_1,
       avg(customer.age) AS avg_1,
       min(customer.age) AS min_1,
       max(customer.age) AS max_1
FROM customer
WHERE lower(customer.country) = lower(?)
  AND (customer.age IS NULL OR customer.age > ?)
```

Bound parameters: `(0, 'UK', 10)`. Deterministic fixture result: `[4,80,26.666666666666668,20,30]`, while records take is one. Listeners attach after fixture seeding. They prove five descriptors execute **one aggregate statement**, two SELECTs with records or three with requested totalCount; inactive summaries add none. Statement structure and actual cursor events verify Customer FROM, no ORDER BY/LIMIT/OFFSET, and the **same predicate object** in all three executed statements. The filter compiler is called exactly once. API/query tests show invalid sort/filter/summary structure executes **zero statements**. These are execution observations, not source-only claims or brittle complete SQL snapshots.

## Filtering, paging, sorting and count independence

- UK seed IDs are `8,18,28,38,48,58,68,78,88,98`; their ages are `null,62,22,27,32,37,42,null,52,57`. Count is ten, sum 331, avg 41.375, min 22, max 62.
- `take=5` returns five UK records but summary count ten. Nested Phase 7 predicates, case-insensitive country comparisons and nullable age conditions reuse the same compiled predicate.
- ASC/DESC, multi-sort, page size, later pages and paging beyond the final page leave summary values unchanged for a fixed filter. The records query retains sort clauses and ID tie-breaker.
- `totalCount` is independently conditional on `requireTotalCount=true`; summary count occupies only its requested positional slot. True/false/omitted count cases are tested. Undefined count stays absent.
- Phase 7 date-only transport, nullable-NOT policy, case-insensitive comparisons, LIKE escaping and complexity limits were not changed.

## Browser E2E evidence

The final `pnpm test:e2e` run passed **17/17 tests in 32.1 seconds** under configured headless Chromium in `Asia/Tokyo`: all 13 previous scenarios plus four summary scenarios. The existing Playwright configuration, CORS setup, disposable 100-row database lifecycle and strict console checks were retained.

Independently established seed expectations: 100 rows, 85 non-null ages, age sum 3550, summary `[100,41.76470588235294,22,62]`; footer average `41.76`. UK summary is `[10,41.375,22,62]`, with client-formatted average `41.38`.

Actual captured filtered/sorted `POST http://127.0.0.1:8000/api/customers/grid` body:

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 5,
    "requireTotalCount": true,
    "sort": [
      { "selector": "company", "desc": false },
      { "selector": "name", "desc": true }
    ],
    "filter": ["country", "=", "UK"],
    "totalSummary": [
      { "selector": "id", "summaryType": "count" },
      { "selector": "age", "summaryType": "avg" },
      { "selector": "age", "summaryType": "min" },
      { "selector": "age", "summaryType": "max" }
    ]
  }
}
```

Actual 200 response (all five returned records, with JSON properties arranged for readability):

```json
{
  "data": [
    {
      "id": 28,
      "name": "Henry Williams",
      "company": "Initech",
      "city": "London",
      "country": "UK",
      "active": true,
      "age": 22,
      "joined_on": "2022-01-14"
    },
    {
      "id": 8,
      "name": "Henry Smith",
      "company": "Initech",
      "city": "London",
      "country": "UK",
      "active": true,
      "age": null,
      "joined_on": "2021-04-09"
    },
    {
      "id": 88,
      "name": "Henry Rodriguez",
      "company": "Initech",
      "city": "London",
      "country": "UK",
      "active": true,
      "age": 52,
      "joined_on": "2024-05-03"
    },
    {
      "id": 68,
      "name": "Henry Miller",
      "company": "Initech",
      "city": "London",
      "country": "UK",
      "active": true,
      "age": 42,
      "joined_on": "2023-07-28"
    },
    {
      "id": 98,
      "name": "Henry Martinez",
      "company": "Initech",
      "city": "London",
      "country": "UK",
      "active": true,
      "age": 57,
      "joined_on": "2024-09-20"
    }
  ],
  "totalCount": 10,
  "summary": [10, 41.375, 22, 62]
}
```

The final run's screenshot was opened and visually inspected: five UK rows, two ordered sort indicators, page size five, “Page 1 of 2 (10 items)”, and `Customers: 10`, `Average age: 41.38`, `Minimum age: 22`, `Maximum age: 62`. No grouping panel is visible. An evaluation-license banner is present.

Local generated evidence (not npm contents or committed proprietary assets):

- `test-results/summary-FastAPI-native-tot-d2c82-n-clear-restores-all-totals-chromium/filtered-sorted.json`: request, complete response, independent seed expectations and rendered footer texts.
- The adjacent `filtered-sorted.png`: inspected visible footer and grid screenshot.
- Other summary tests attach paired JSON/screenshots for initial totals, UK filtering, filtered/sorted page two, clearing, empty results, all-null age and date filtering. Tests recreate these artifacts; a future Playwright run can replace them.

Every tested summary action asserts **one grid HTTP request with all four descriptors**, not one request per item. This is independent of the backend SQL statement-count evidence. Empty results return `[0,null,null,null]` with blank age values beside labels; an all-null single-row result returns `[1,null,null,null]`.

### Section 77 observed browser smoke checklist

These are **automated real-browser observations plus screenshot inspection**, not a claim of human-operated manual testing.

| Check                                    | Actual result                                                                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1. Remote paging                         | Pass: forward/back navigation and correct skip/take.                                                             |
| 2. Page-size selector does not roll back | Pass: existing 10→5→25 regression and summary 10→5 flow.                                                         |
| 3. Filtering                             | Pass: real Country Filter Row, numeric and Boolean regressions.                                                  |
| 4. Multi-column sorting                  | Pass: Company ASC + Name DESC request and native indicators.                                                     |
| 5. Date filtering                        | Pass: Asia/Tokyo date-only bounds, including summary date scenario.                                              |
| 6. Footer appears                        | Pass: DOM assertions and inspected screenshot.                                                                   |
| 7. Initial count/avg/min/max             | Pass: `[100,41.76470588235294,22,62]`, formatted average 41.76.                                                  |
| 8. Filtering changes summaries           | Pass: UK `[10,41.375,22,62]`.                                                                                    |
| 9. Paging preserves summaries            | Pass: unfiltered and filtered forward/back pages at size five.                                                   |
| 10. Sorting preserves summaries          | Pass: filtered multi-sort and second page.                                                                       |
| 11. Clear restores summaries             | Pass: original 100-row values restored.                                                                          |
| 12. Zero-row result                      | Pass: `[0,null,null,null]`, count zero and blank labeled age values.                                             |
| 13. Backend 422 errors                   | Pass: existing real 422 error banner and recovery scenario.                                                      |
| 14. Loading indicator                    | Pass: existing delayed-request native load-panel scenario.                                                       |
| 15. No grouping UI                       | Pass for supported configuration: explicit false operation flags, disabled group panel and inspected screenshot. |
| 16. No request per descriptor            | Pass: one HTTP request carrying four descriptors per asserted action.                                            |

**Manual/headed limitation:** an additional `pnpm exec playwright test summary.spec.ts --project=chromium --headed --retries=0 --output=test-results\step5-summary` diagnostic failed the strict console assertion because the example's `/favicon.ico` returned HTTP 404. A focused headed rerun (`--grep 'initial 100-row'`, output `test-results\step5-diagnostic`) confirmed that URL. No suppression, mocked favicon response or unrelated app change was added. A clean headed/human-interaction smoke pass remains outstanding; the required default headless gate passes in full.

## Files changed and tests added/changed

- Package: `src/remote/types.ts`, `loadOptions.ts`, `createGridStore.ts`, new `summaryOptions.ts`; `src/types.ts`, `src/index.ts`, `src/DatagridDXRemote.tsx`.
- Backend: `app/grid/models.py`, `fields.py`, new `summaries.py`, `query.py`, `app/main.py` under the FastAPI example.
- Browser example: frontend `App.tsx`, `dataProvider.ts`; `tests/e2e/helpers.ts`, new `summary.spec.ts`.
- Frontend tests: normalization/store/public types and mounted-store regressions; new `remoteSummarySemantics.test.tsx`, `summaryOptions.test.ts`, `DatagridDXRemoteSummary.test.tsx`. Existing grid lifecycle suite retained unchanged.
- Backend tests: models/fields/query/API updates; new `test_grid_summaries.py` and `test_grid_summary_execution.py`. Existing exhaustive Phase 7 filter/security cases retained.
- Documentation: root/example READMEs, this report and approved numbered plan; execution plan statuses updated. No PRD modification.

## Verification and test counts

Fresh final counts: **538 Vitest**, **1,787 Pytest**, **17 Playwright**, all passing. No tests were skipped or disabled to obtain these results. Earlier historical counts are not used as current evidence.

Commands ran from `D:\github\ra-devextreme-grid` on Windows/PowerShell; paths below use portable repository notation. Python tools used the configured UV-managed backend virtual environment, Python **3.13.12**. Each required gate ran, with the final result below:

| Command                                                                    | Final actual result                                                                                                    |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                           | Exit 0; lockfile current, already up to date; pnpm 10.20.0.                                                            |
| `pnpm lint`                                                                | Exit 0.                                                                                                                |
| `pnpm format:check`                                                        | Exit 0; all matched files formatted.                                                                                   |
| `pnpm typecheck`                                                           | Exit 0; full `tsc --noEmit`, including E2E sources.                                                                    |
| `pnpm test`                                                                | Exit 0; 18 files, 538 tests passed.                                                                                    |
| `pnpm build`                                                               | Exit 0; 11 modules, JS 24.03 kB (gzip 7.19 kB), source map 71.39 kB; declarations generated.                           |
| `pnpm build:example`                                                       | Exit 0; 3,284 modules; production example built.                                                                       |
| `pnpm build:remote-fastapi`                                                | Exit 0; 3,285 modules; production FastAPI frontend built.                                                              |
| `pnpm test:e2e`                                                            | Exit 0; 17 tests passed in 32.1s.                                                                                      |
| `pnpm pack --json`                                                         | Exit 0; actual archive inspected, 18 files.                                                                            |
| `uv sync --locked --directory examples/remote-fastapi/backend`             | Exit 0; 27 packages resolved, 26 audited, no upgrades.                                                                 |
| `uv run --directory examples/remote-fastapi/backend ruff check .`          | Exit 0; all checks passed.                                                                                             |
| `uv run --directory examples/remote-fastapi/backend ruff format --check .` | Exit 0; 19 files already formatted.                                                                                    |
| `uv run --directory examples/remote-fastapi/backend pytest`                | Exit 0; 1,787 passed in 4.19s, three warnings.                                                                         |
| `git diff --check`                                                         | Exit 0; no whitespace errors.                                                                                          |
| `git status`                                                               | Exit 0; intended unstaged modifications/new files on main, no conflicts/staged changes.                                |
| `git diff`                                                                 | Exit 0; reviewed implementation/documentation/test changes; no dependency, schema, CORS/lifecycle or grouping changes. |

IDE build checks also reported success, but explicitly have limited diagnostic collection; they are not substituted for compiler/test/build commands.

Development failures were fixed rather than hidden: selector-less native typing fixtures and bigint test titles; shared mutable native summary test items; an incorrect filter-compiler import; obsolete API/OpenAPI/mounted-store summary rejection expectations; Ruff formatting; and two possibly-undefined E2E assertion accesses. The query integration's nine new cases were observed failing before implementation and passing afterward. The extra headed favicon diagnostic remains the separate limitation above.

Non-failing warnings: DevExtreme evaluation `W0019`/`W0021` and an existing `W1005` test fixture; expected provider-error logs in error tests; Vite dependency `use client` directives and example chunk-size warnings; `FORCE_COLOR`/`NO_COLOR`; two Starlette/AnyIO dependency deprecations; one intentional bypassed-model/function-selector Pydantic serialization warning before rejection. No dependency upgrades or warning-based test bypasses were introduced.

### Regression status

All previous managed/remote frontend tests and exhaustive Phase 7 backend tests remain enabled. Existing browser paging, page-size persistence, multi-sort, filtering, date-only transport, 422 recovery, loading and development CORS scenarios pass. Disposable database and Playwright configuration files are unchanged. No current default-mode regression is known.

### Package inspection

`pnpm pack --json` and `tar -tf ra-devextreme-grid-0.0.0.tgz` agree: 18 entries, comprising 15 `dist/` JS/map/declaration files plus `README.md`, `LICENSE`, and `package.json`. No backend, example, E2E, database, reports, screenshots or DevExtreme theme assets enter the npm package. The generated archive was removed after inspection, not published.

Opened emitted `dist/index.d.ts`, `dist/remote/types.d.ts` and `dist/types.d.ts`: exports include the new descriptor/type/value and safe native Summary options; count selector omission is preserved; `data: RecordType[]` remains flat; grouping aliases remain omitted. The package export map remains root-only. The core remains theme-agnostic and backend-agnostic.

## Security review

- Every supplied summary selector resolves through the shared registry; hostile `age; DROP TABLE customer`, `__dict__`, `customer.age`, `password_hash` fail closed, including supplied count selectors.
- Fixed literal types and explicit SQLAlchemy dispatch; no dynamic `func.<client_input>`, raw SQL text, sanitization-and-continue, selector-keyed response or Python aggregation of loaded rows.
- Bounded descriptor count in transport, wire model and pure builder; duplicates cannot bypass the bound. Malformed descriptors fail before execution.
- All filter/sort/summary structure validated before count/aggregate/records; execution listeners verify zero SQL on invalid requests.
- Result scalars and exact positional length validated in the adapter, including sparse holes and non-finite numbers.
- Existing Phase 7 filter/compiler security and Phase 7B CORS/disposable database lifecycle remain unchanged. No auth or deployment security is implied by this reference backend.

## Architecture review and Phase 8B readiness

The public contract matches observed native descriptors and processed positional summary results. Order/duplicates are retained end to end, complete filtered-set semantics are explicit, paging/sorting are excluded from aggregation, and NULL/empty/count behavior is investigated rather than inherited accidentally from SQL. All aggregates remain SQL-side in one statement; totalCount stays independent.

Grouping remains unavailable and `data` was not widened. The registry capability metadata and pure aggregate-expression builder are reusable for future group summaries without unpicking session ownership. `query.py` remains the sole execution owner. No metadata wrapper, generic resource layer or summary DSL was added prematurely. Phase 8B should deliberately design grouped records, `groupSummary`, group count, group keys and NULL group semantics; it must not infer those from the current flat result. No Phase 8B implementation has started.

## Deviations, known limitations and risks

- New focused test files separate native Summary integration and SQL execution instrumentation rather than making the existing large grid/query test files harder to navigate. Existing regression assertions are preserved; obsolete total-summary rejection fixtures now reject invalid descriptors instead.
- Pure expressions require no normalization metadata because SQL coalescing handles sum. This follows the approved smaller boundary.
- Native declarations require selectors more broadly than runtime; selector-less native test probes use an explicit assertion boundary. Public adapter types reflect observed runtime.
- No grouping, group summaries, group count, group paging, Header Filter, Search Panel, Filter Builder, inline editing or state persistence. No authentication, relationship queries, generic resource framework or schema additions.
- Non-integer fields are count-only; date/string min/max and Decimal/money semantics remain undefined. SQLite integer overflow and JavaScript numeric precision limitations remain. Backend averages are not rounded.
- Only default skip-empty behavior is supported. Remote null labels differ from local NaN-hidden footer items; no claim of exact DOM parity.
- Native JSX and imperative APIs remain broadly configurable. Focused summary guards are not a sandbox for arbitrary unsupported grid options.
- Only Chromium was exercised. A clean headed/human-interaction smoke pass remains outstanding due to the favicon 404 diagnostic; headless round trips and captured footer screenshots are verified. Resolve the example favicon separately before requiring a strict headed pass.

## PRD feedback

Keep advanced remote operations split into 8A totals, 8B grouping/group summaries/group count, and 8C group paging. Explicitly document selector-less row count, duplicate positional descriptors, cache-dependent omission and JSON null empty extrema. Native custom callbacks can be silently ignored remotely, so future features need resolved-option validation as well as request validation. Keep default-deny field capabilities and explicit FROM/row-result regressions when extending the builder. No PRD text was silently rewritten.
