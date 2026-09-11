# Phase 7 — Secure Remote Filter Compiler

## Implementation Summary

Implemented a framework-light, independently testable DevExtreme-to-SQLAlchemy compiler for the existing `POST /api/customers/grid`. A single recursive descent validates structure, resolves typed registry entries, converts values, tracks budgets and builds bound SQL expressions. There is no intermediate AST or separate validation pass. One compiled WHERE object is reused for filtered count and records; deterministic sorting and paging remain database-side.

Approved design and investigation evidence were saved before source changes in [009-phase-7-secure-filter-compiler.md](../.junie/plans/009-phase-7-secure-filter-compiler.md). Delivery followed the ordered checklist in [phase-7-secure-filter-compiler.md](../.junie/plans/phase-7-secure-filter-compiler.md).

## Filter Grammar and Logical Compiler

```text
condition := [selector, value] | [selector, operator, value]
not       := ["!", expression]
group     := [expression]
           | [expression, "and", expression, ...]
           | [expression, "or", expression, ...]
           | [expression, expression, ...]
```

- Top-level `None` / `[]` returns no clause. Nested empty arrays reject.
- Condition length determines shorthand first. `["country", "="]` is equality with literal `"="`, not a missing operand. `["country","UK"]`, `["active",true]`, `["age",null]` and explicit equivalents are tested.
- Reserved unary `!` requires exactly one expression. Non-nullable nested/double NOT works.
- Adjacent expressions imply AND; explicit and implicit AND can coexist. Each group level is homogeneous AND or OR. Mixed flat groups, including implicit AND mixed with OR, reject; nest to express precedence.
- Single-child wrappers are supported and budgeted. Malformed arity, selector/operator types, leading/trailing/repeated/unknown connectors, scalar children and unsupported custom structures fail deliberately.
- Helpers `_compile_expression`, `_compile_condition`, `_compile_group`, `_compile_not`, `_convert_value` and `_build_condition` keep parsing and SQL generation separate at a small scale. `_CompiledFilter` carries a clause and one nullable selector for a targeted error, not an AST. Shared `_CompilationState` counts nodes.

## Supported Operator Table

| Operator      | String | Integer | Boolean | Date |
| ------------- | ------ | ------- | ------- | ---- |
| `=`           | Yes    | Yes     | Yes     | Yes  |
| `<>`          | Yes    | Yes     | Yes     | Yes  |
| `>`           | No     | Yes     | No      | Yes  |
| `>=`          | No     | Yes     | No      | Yes  |
| `<`           | No     | Yes     | No      | Yes  |
| `<=`          | No     | Yes     | No      | Yes  |
| `contains`    | Yes    | No      | No      | No   |
| `notcontains` | Yes    | No      | No      | No   |
| `startswith`  | Yes    | No      | No      | No   |
| `endswith`    | Yes    | No      | No      | No   |

Direct `between` is not required or accepted: native numeric Filter Row output expands to comparisons. `anyof`, `noneof`, arbitrary SQL/operator names and custom operations reject.

## Field Registry and Value Conversion

`GridValueType` contains exactly STRING, INTEGER, BOOLEAN and DATE. The shared registry uses:

```python
@dataclass(frozen=True, slots=True)
class GridField:
    expression: ColumnElement[Any]
    value_type: GridValueType
    sortable: bool = True
    filterable: bool = True
    nullable: bool = False
```

| Fields                               | Type    | Nullable |
| ------------------------------------ | ------- | -------- |
| `id`                                 | INTEGER | No       |
| `name`, `company`, `city`, `country` | STRING  | No       |
| `active`                             | BOOLEAN | No       |
| `age`                                | INTEGER | Yes      |
| `joined_on`                          | DATE    | No       |

All eight explicit entries currently allow sorting/filtering. `get_customer_sort_column()` remains compatible and returns the registered expression after checking `sortable`. Filtering independently checks `filterable`. Tests use expression identity, frozen metadata and independently varied flags. No automatic model introspection or second whitelist.

- Strings: actual JSON strings only; no stringification.
- Integers: actual JSON integers, excluding Boolean/float/numeric-string coercion; signed 64-bit bounds prevent SQLite binding overflow.
- Booleans: actual JSON booleans, not `0`, `1`, or strings.
- Dates: exact ASCII `YYYY-MM-DD`, parsed into Python `date`, years 0001–9999. Invalid/impossible/non-padded dates, whitespace, timestamps/offsets and wrong types reject.
- Null: only nullable-field `=` / `<>`, via `IS NULL` / `IS NOT NULL`; no ordinary `= NULL` comparisons.

## Mandatory Date Transport Investigation

Public API tests against installed **DevExtreme 26.1.4** use real DataGrid instances and processed CustomStore loads. Native date Filter Row operands are **Date objects**, and `normalizeLoadOptions()` preserves their filter reference. Normal JSON serialization emits UTC timestamps, not date-only strings.

Fresh Date objects/grids and snapshots taken at load time confirm these January 2024 ranges (calendar dates shown):

| Filter Row operation | Store comparison         |
| -------------------- | ------------------------ |
| `= Jan 15`           | `>= Jan 15 AND < Jan 16` |
| `<> Jan 15`          | `< Jan 15 OR >= Jan 16`  |
| `> Jan 15`           | `>= Jan 16`              |
| `>= Jan 15`          | `>= Jan 15`              |
| `< Jan 15`           | `< Jan 15`               |
| `<= Jan 15`          | `< Jan 16`               |
| `between Jan 15–17`  | `>= Jan 15 AND < Jan 18` |

The compiler consumes those comparisons without expanding them again. Fresh fixtures avoid confusing mutable native Date state with the emitted operation.

The example-local `normalizeDateOnlyFilter()` converts only known `joined_on` Date operands, non-mutatingly, before JSON serialization. It uses local year/month/day components, validates Date/year bounds, preserves native operators/exclusive next-day boundaries and leaves strings/unrelated fields unchanged. It is not exported by the npm package, which cannot infer DATE versus timestamp semantics.

A Tokyo local January 15 midnight serializes to `2024-01-14T15:00:00.000Z`, but the intended DATE is `2024-01-15`. Thus `toISOString().slice(0,10)` is not safe. Full timestamps are rejected on the backend, not silently truncated. Future DATETIME/timestamp fields need separate contracts. The application must ensure its Date object's local components represent the intended business calendar.

Transport test outcomes and positive/negative timezone evidence are recorded in the final verification section below.

## Mandatory String Case and NULL Investigations

Shared four-row parity dataset:

| ID  | Name    | Age  | Active | Country | joined_on  |
| --- | ------- | ---- | ------ | ------- | ---------- |
| 1   | Smith   | null | true   | UK      | 2024-01-14 |
| 2   | SMITH   | 30   | false  | UK      | 2024-01-15 |
| 3   | Jones   | 40   | true   | France  | 2024-01-16 |
| 4   | sm%_ith | 20   | false  | USA     | 2024-01-17 |

Public ArrayStore results and backend SQLite execution agree on these representative cases:

| Expression                                      | IDs in both |
| ----------------------------------------------- | ----------- |
| name = smith / contains SMI / startswith smi    | 1,2         |
| name <> smith / notcontains smith               | 3,4         |
| name endswith ITH                               | 1,2,4       |
| name contains literal %_                        | 4           |
| age >= 30                                       | 2,3         |
| age < 30                                        | 4           |
| age = null                                      | 1           |
| age <> null                                     | 2,3,4       |
| age >= 30 AND active = true (also implicit AND) | 3           |
| country UK OR France                            | 1,2,3       |
| NOT active = true                               | 2,4         |
| active AND (UK OR (France AND age >= 40))       | 1,3         |

All six string operators are intentionally case-insensitive. SQL equality/inequality lower both column and bound value; searches use case-insensitive SQLAlchemy operations. ASCII parity is supported by executed tests, **not a broad Unicode claim**. SQLite `lower()` does not implement full Unicode folding, unlike JavaScript's behavior. Production collation/index policy remains application-specific.

| Nullable expression | DevExtreme IDs           | Backend                          |
| ------------------- | ------------------------ | -------------------------------- |
| age <> 30           | 1,3,4                    | 3,4 (ordinary SQL excludes NULL) |
| NOT(age > 30)       | 1,2,4                    | Reject                           |
| NOT(age = null)     | Local Boolean complement | Reject conservatively            |

The conservative nullable-NOT rule rejects **every NOT subtree referencing nullable `age`**, including explicit null checks, guarded expressions and double negation. It does not globally disable NOT or attempt logical proofs/NULL-complement rewrites. This restriction is stricter than some mathematically safe special cases by design.

Numeric Filter Row `>=30` supplies number `30`, Boolean equality supplies actual `true`, and numeric `between [20,40]` expands to inclusive `>=20 AND <=40`. ArrayStore rejects direct `between` with `E4003`; mixed flat groups with `E4019`. Native two-item equality and implicit AND are confirmed. These are jsdom/public-API evidence, not visual browser verification.

## SQL Construction, Binding and LIKE Escaping

Selectors resolve exclusively to registry expressions. Fixed operator/type dispatch chooses SQLAlchemy comparison functions; scalar comparison values use typed `literal()` bind parameters (including Boolean values). String comparisons use `func.lower()` on both operands. Searches use `icontains`, `istartswith`, `iendswith(autoescape=True)`; `notcontains` applies `not_` to escaped contains. Groups use `and_` / `or_`; NOT uses `not_`.

Tests inspect bind parameters rather than large SQL snapshots or `literal_binds`. `%`, `_`, `/` (SQLAlchemy's escape character), backslash, quotes/apostrophes and SQL-looking text are tested as literal data. Hostile text cannot broaden matches unexpectedly; the Customer table and row count remain intact. No destructive SQL is executed for the security test.

No client-generated SQL text, `.op(client_text)`, arbitrary `getattr` traversal, executable evaluation, dynamic imports or SQL-expression truthiness exists in the compiler. The only caught conversion exception is expected date `ValueError`; unexpected programming/database exceptions retain normal server-error behavior.

## Complexity Protection

| Constant                   | Value | Rationale/accounting                                                                                              |
| -------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `MAX_FILTER_DEPTH`         | 16    | Root nonempty expression depth 1; every nested expression array increments; comfortably below recursion limits    |
| `MAX_FILTER_NODES`         | 200   | Each condition/NOT/group/wrapper counts once, not connectors/scalar operands; bounds clauses/binds conservatively |
| `MAX_FILTER_STRING_LENGTH` | 1024  | Characters per individual string value; sufficient for normal Filter Row text                                     |

Limits are checked before descending/building another node. Child clause collections are bounded by the shared counter; no unbounded preliminary AST/collection is constructed. Tests execute depth 16 and nodes 199/200, reject depth 17 and node 201, account for wrappers and NOT, and verify early stopping on 10,000-node input. Direct pathological nesting/cyclic Python input fails with GridQueryError, not RecursionError. HTTP limit cases return 422.

Earlier JSON parsing and Pydantic validation are outside these budgets: upstream body-size controls remain a deployment responsibility, alongside request/query timeouts and authorization.

## Query Integration and Actual Results

```text
validate sort + compile filter once
  -> same WHERE for COUNT (if requested) and Customer SELECT
  -> ORDER BY all descriptors + deterministic ID tie-breaker
  -> OFFSET -> LIMIT
  -> unchanged response envelope
```

Statement instrumentation proves one compilation and expression-object identity in both WHERE criteria, no unrequested COUNT, and no SQL execution for invalid filters or sorts even when a count is requested. Page bounds remain 20 default / 100 maximum. Default ID ascending and explicit ID descending behavior remain unchanged.

On the isolated 100-row seed, `country = UK`, `take=5`, `requireTotalCount=true` returns IDs **[8,18,28,38,48]** with **totalCount 10**. Count is neither all 100 rows nor only the five returned rows.

Actual requested combined query:

```json
{
  "loadOptions": {
    "skip": 5,
    "take": 5,
    "requireTotalCount": true,
    "filter": [["active", "=", true], "and", ["country", "=", "UK"]],
    "sort": [
      { "selector": "company", "desc": false },
      { "selector": "name", "desc": true }
    ]
  }
}
```

HTTP and integration tests return **[48,18,58,78,38]**, **totalCount 10**, identically on repetition. All seeded UK rows share a company, so an additional varied fixture proves both sort priorities and exact ties: combined page **[3,6,9,1,8]**, **totalCount 12**. Eight sorting configurations test precedence, ID direction and default ordering; zero matches and skips beyond the filtered result are also covered.

The nested `active AND (UK OR France)` request returns **[7,8,18,27,28,38,47,48,58,67,68,78,87,88,98]**, **totalCount 15**. The example README includes executable seeded curl requests.

## Error Behavior and Security Review

Deliberate failures preserve the existing HTTP 422 shape:

```json
{
  "detail": [{ "msg": "Unknown filter selector: 'password_hash'", "type": "grid_query_error" }]
}
```

Malformed groups, unsupported operators/type pairs, wrong values, timestamps, nullable NOT and budgets use the same handler. Pydantic structural/extra-field errors retain normal validation responses. Errors contain no SQL, connections or stack details. Tests prove unexpected compiler/query/database failures are not caught and relabeled as 422.

| Audit control             | Finding                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| SQL structure             | Explicit eight-field registry only; hostile/dotted/dunder/managed suffix selectors reject           |
| Operators/types           | Fixed matrix; unknown/custom names reject; strict integer/Boolean distinction                       |
| Values/binds              | Typed data only; SQL-looking text remains a bind; signed integer bounds enforced                    |
| Searches                  | Autoescaped case-insensitive operators; literal %, _, escape/quote tests pass                       |
| NULL/date                 | Proper IS predicates; conservative nullable-NOT propagation; strict date-only parsing               |
| Parser/budgets            | One traversal, exact connectors/arity, malformed nesting and exact limits tested                    |
| Query pipeline            | Compile once/shared WHERE, filtered conditional count, sort then offset/limit                       |
| Paging/request validation | Existing page bounds, aliases, optional counts and extra-field rejection retained                   |
| Exception boundary        | Only deliberate GridQueryError handled as semantic 422; no broad catch                              |
| Advanced scope            | No Header Filter/Search Panel/Filter Builder enablement, grouping/summaries, editing or persistence |
| Architecture              | Small registry/compiler/query separation; no parser framework, AST hierarchy or generic repository  |

No unresolved Phase 7 correctness/security finding was identified within this scope. This is not a production security certification; resource limits before semantic parsing, auth and database-specific performance policies still belong to deployment/application design.

## Files and Tests Added/Changed

- `backend/app/grid/fields.py`: frozen typed metadata and compatible sort resolver.
- `backend/app/grid/filtering.py`: dedicated compiler and three named limits.
- `backend/app/grid/query.py`: pre-execution validation and shared filtered queries.
- `backend/tests/test_grid_fields.py`: metadata/flags/identity and hostile selectors.
- `backend/tests/test_grid_filtering.py`: pure validation and isolated SQLite execution; comprehensive parametrized operator/value/grammar/security/budget tests.
- `backend/tests/test_grid_query.py`, `test_api.py`: converted Phase 6 rejection coverage, successful filtering, instrumentation, varied sorts and precise 422/error boundaries. Existing sorting/paging/extra/OpenAPI tests preserved.
- `tests/remoteFilteringSemantics.test.tsx`: 45 public DevExtreme conformance cases (35 ArrayStore, 10 real-grid processed-store cases).
- `examples/remote-fastapi/dateOnlyFilter.ts`, `tests/dateOnlyFilter.test.ts`: example-local transport and deterministic timezone tests.
- `examples/remote-fastapi/README.md`, root `README.md`, this report and approved plan artifacts.

Paths prefixed `backend/` above are relative to `examples/remote-fastapi/`. Core `src/`, npm contract/exports, dependency manifests/lockfiles, CI, backend wire models and endpoint handler are unchanged. The existing CI Python job discovers all new tests; no redundant workflow was added.

## Python Test Count and Live HTTP Verification

Complete backend suite: **1,515 passed**, no failures/skips. Breakdown: API 74, fields 10, compiler 1,354, models 9, query 68. This is an executed result, not the historical 35-test baseline. Two dependency deprecations remain: Starlette TestClient/httpx integration and `anyio.abc.BlockingPortal` alias.

After that suite, an actual Uvicorn server ran on an ephemeral loopback port with an isolated SQLite/StaticPool engine and the normal 100-row seed. A temporary HTTPX smoke script used real network requests (not TestClient). `finally` stopped/joined Uvicorn, closed its socket and disposed the engine; the temporary script was removed.

| Live case                                       | HTTP | Actual result                                                                                   |
| ----------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------- |
| country = UK                                    | 200  | count 10; IDs 8,18,28,38,48,58,68,78,88,98                                                      |
| age >= 50                                       | 200  | count 28; IDs 7,9,16,17,18,25,26,27,34,35,44,45,52,53,54,61,62,63,70,72,79,80,81,88,89,90,97,98 |
| active = true                                   | 200  | count 75; IDs 1–100 excluding those congruent to 1 modulo 4                                     |
| active AND (UK OR France)                       | 200  | count 15; IDs 7,8,18,27,28,38,47,48,58,67,68,78,87,88,98                                        |
| UK take 5 filtered count                        | 200  | count 10; IDs 8,18,28,38,48                                                                     |
| active UK + company ASC/name DESC + skip5/take5 | 200  | count 10; IDs 48,18,58,78,38; repeated response identical                                       |
| trailing connector                              | 422  | grid_query_error: Invalid filter group: trailing connector                                      |
| password_hash selector                          | 422  | grid_query_error: Unknown filter selector                                                       |
| name contains `' OR 1=1 --`                     | 200  | count 0; no rows                                                                                |
| joined_on = 2021-01-01                          | 200  | count 1; ID 1                                                                                   |
| joined_on timestamp                             | 422  | grid_query_error: expected YYYY-MM-DD                                                           |
| NOT(age > 30)                                   | 422  | grid_query_error: nullable age / NULL semantics differ                                          |
| final unfiltered table check                    | 200  | count still 100                                                                                 |

## Final Verification Gates

Executed on Windows with PowerShell, Node 24.14.1, pnpm 10.20.0 and the existing Python 3.13.12 UV environment. Every required gate completed successfully:

| Directory | Command                          | Actual outcome                                                         |
| --------- | -------------------------------- | ---------------------------------------------------------------------- |
| Root      | `pnpm install --frozen-lockfile` | Exit 0; lockfile/dependencies already current                          |
| Root      | `pnpm lint`                      | Exit 0; ESLint clean                                                   |
| Root      | `pnpm format:check`              | Exit 0; all matched files formatted                                    |
| Root      | `pnpm typecheck`                 | Exit 0; TypeScript clean                                               |
| Root      | `pnpm test`                      | Exit 0; **369 tests in 15 files passed**, no failures/skips            |
| Root      | `pnpm build`                     | Exit 0; library and declarations built; 10 modules, index.js 19.76 kB  |
| Root      | `pnpm build:example`             | Exit 0; 3,283 modules built; dependency directive/chunk warnings below |
| Root      | `pnpm pack --json`               | Exit 0; package created and inspected, then tarball removed            |
| Backend   | `uv sync --locked`               | Exit 0; 27 packages resolved, 26 audited; no dependency change         |
| Backend   | `uv run ruff check .`            | Exit 0; all checks passed                                              |
| Backend   | `uv run ruff format --check .`   | Exit 0; final 16 Python files formatted                                |
| Backend   | `uv run pytest`                  | Exit 0; **1,515 passed**, two dependency warnings                      |
| Root      | `git diff --check`               | Exit 0; no whitespace errors                                           |
| Root      | `git status`, `git diff`         | Reviewed intended source/tests/docs/plan changes; no staged changes    |

The full frontend count is the existing **282** plus **45 native semantics** and **42 date transport** cases. The transport tests include behavior/immutability/invalid-year coverage and two deterministic subprocess timezone cases executing the actual helper after in-memory TypeScript transpilation (no generated files). All four calendar probes normalize to `2024-01-15`:

| Zone                | Local time January 15 | Ordinary JSON timestamp    |
| ------------------- | --------------------- | -------------------------- |
| Asia/Tokyo          | 00:00:00.000          | `2024-01-14T15:00:00.000Z` |
| Asia/Tokyo          | 23:59:59.999          | `2024-01-15T14:59:59.999Z` |
| America/Los_Angeles | 00:00:00.000          | `2024-01-15T08:00:00.000Z` |
| America/Los_Angeles | 23:59:59.999          | `2024-01-16T07:59:59.999Z` |

Package inspection via `tar -tf` found **17 entries**: 14 `dist/` outputs plus README, LICENSE and package.json. No backend code/database, tests, date helper, plans, credentials or node_modules were packaged. Existing core exports remain unchanged. The generated tarball and temporary HTTP smoke script were removed; pre-existing build directories and local database were not deleted. No server remains running. Nothing was committed, pushed, tagged or published.

Warnings and intermediate corrections:

- Frontend tests emitted DevExtreme license/trial `W0019`/`W0021`, `W1005` for unspecified column types in existing fixtures, development-mode notices, and expected error-path logs (remote-service/access-denied 403). They did not cause failures.
- Vite's example build warned that dependency `"use client"` directives were ignored and that the minified example chunk exceeds 500 kB (3,309.66 kB JavaScript, 942.45 kB gzip). No build settings or warning thresholds were changed to suppress them.
- Python emitted the two TestClient/AnyIO deprecations identified above. Dependencies were not upgraded to silence them.
- Initial compiler Ruff import-order/line-length findings and the date-test subprocess source-path harness failure were fixed before the final gates; no test was disabled or weakened. Some file-structure/IDE diagnostics were unavailable, so source inspection and real toolchain checks were used.
- Git emitted normal Windows LF-to-CRLF conversion notices; no whitespace errors. PyCharm build returned success but explicitly reported limited diagnostic collection.

## Type/OpenAPI Impact

No material HTTP/OpenAPI or TypeScript shape changes. `filter?: unknown[] | null` / `filter: list[JsonValue] | None`, aliases, `extra="forbid"`, records and optional totalCount are unchanged. Previously rejected nonempty arrays now have explicitly bounded semantic support. Existing OpenAPI and strict-schema tests pass. Native unsupported remote options and executable-function rejection remain untouched.

## Deviations, Known Limitations and Risks

- No deviation from the approved grammar, date-only, nullable-NOT or single-traversal decisions. Equality shorthand supersedes the original illustrative malformed `["country","="]` case as explicitly agreed.
- Existing Python 3.13.12 virtual environment was attached to PyCharm to run verification; no dependency upgrades were made. IDE build reported success with limited diagnostics, so real Ruff/pytest/TypeScript/build gates provide the meaningful verification.
- No direct between, anyof/noneof, Header Filter distinct values, Search Panel, Filter Builder UI, grouping, summaries, group paging, relationships, inline editing, state persistence, authentication or browser/CORS wiring.
- SQL nullable inequality intentionally differs from local DevExtreme; conservative NOT rejects even some safe nullable cases. Broad Unicode/collation parity is not claimed. Date transport assumes the intended calendar is represented by local Date components, not UTC truncation.
- Function-based comparisons can inhibit ordinary indexes. Production may need collations, PostgreSQL citext, provider-specific operators/indexes and measured query plans. No speculative SQLite index tuning was added.
- Compiler budgets do not cap earlier JSON/Pydantic parsing or network request bodies. Deployments need body-size and timeout controls, authentication/authorization and resource budgeting.
- Native behavior is pinned by the existing lockfile and public-API tests, not a private implementation dependency or duplicate evaluator. Future DevExtreme upgrades should rerun conformance tests. jsdom evidence is not a real browser-to-FastAPI check.

## PRD Feedback (No PRD Rewrite)

The PRD's “native filtering” and “null-safe behaviour” need qualified contracts rather than blanket local/server parity: specify application DATE transport, nullable NOT restrictions, ordinary nullable inequality semantics and database collation differences. Native grammar should explicitly include length-based equality shorthand, implicit AND and native expanded ranges while leaving direct between unsupported. The PRD was not modified.

## Phase 7B Recommendation

Recommend a small **Phase 7B — Browser-to-FastAPI End-to-End Example** before Phase 8. It would prove date normalization, real Filter Row/network requests, filtered multi-sort/paging, loading and displayed 422 errors together in a browser. Its separate cost is a deliberate CORS policy, coordinated backend/frontend launch configuration, provider selection and concise setup documentation. That integration is not implemented here.

## Phase 8 Readiness

The explicit registry, framework-light compiler and query assembler are a clean foundation for grouping and summaries. All final gates passed; no unresolved Phase 7 automated/backend HTTP failure blocks design work. Still resolve the browser transport integration in Phase 7B and design advanced request/result shapes, group keys/counts, aggregation null/type/collation semantics, group paging limits and appropriate database tests before enabling those operations. Do not infer support from the compiler's ability to nest Boolean filters. Phase 8 has not begun.
