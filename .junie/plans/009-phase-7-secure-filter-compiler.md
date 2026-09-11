# Phase 7 — Secure Remote Filter Compiler

Approved implementation design, saved before source changes. The delivery checklist is maintained in `phase-7-secure-filter-compiler.md`; that plan contains the full approved requirements and validation matrix.

## Contract and scope

Preserve `POST /api/customers/grid`, camelCase aliases, strict extra-field rejection, `filter?: unknown[] | null`, backend `filter: list[JsonValue] | None`, response data and optional totalCount. Preserve default page size 20, maximum 100, ordered multi-sort and deterministic ID tie-breaking. Compile once before SQL execution; reuse exactly one WHERE clause for the conditional filtered COUNT and records SELECT, then sort, offset and limit.

No core TypeScript changes, dependency upgrades, grouping, summaries, group paging, direct between, anyof/noneof, Header Filter, Search Panel, Filter Builder UI, editing, persistence, authentication, relationships, generic resources, package extraction, indexes, CORS or browser application wiring.

## Shared registry

`app/grid/fields.py` retains GridQueryError and the compatible get_customer_sort_column resolver. Add GridValueType with STRING, INTEGER, BOOLEAN and DATE, plus frozen/slotted GridField(expression, value_type, sortable=True, filterable=True, nullable=False). Explicit fields: id INTEGER; name/company/city/country STRING; active BOOLEAN; age INTEGER nullable; joined_on DATE. Only age is nullable; persisted id is non-null. Both sorting and filtering resolve this same registry and respect their flags. No introspection or arbitrary getattr traversal.

## Compiler and grammar

`app/grid/filtering.py::compile_filter_expression(expression, fields)` returns a Boolean SQLAlchemy ColumnElement, None for top-level None/[], or GridQueryError for deliberate validation failures. No FastAPI imports or query execution. One recursive descent validates structure, resolves metadata, converts values, accounts for complexity and builds expressions. Small focused condition/group/NOT/value helpers; compilation results carry clause plus an offending nullable selector, not an AST.

```text
condition := [selector, value] | [selector, operator, value]
not := ["!", expression]
group := [expression]
       | [expression, "and", expression, ...]
       | [expression, "or", expression, ...]
       | [expression, expression, ...]
```

Recognize reserved ! first with exactly one expression operand. Distinguish conditions by array length before interpreting the second element: ["country", "="] is equality with literal "="; its non-nullable NOT is valid too. Reject one-item conditions, extra operands, non-string selectors/operators, nested empty arrays, non-array children and unsupported value structures. Groups accept exact lowercase connectors only, adjacent children imply AND, explicit and implicit AND can coexist. Reject mixed AND/OR at one level, including implicit AND mixed with OR; require nesting. Single-child wrappers are valid and count toward limits. Reject leading/trailing/repeated/unknown connectors, unknown/custom operators, dotted/dunder/SQL-looking selectors and managed suffix names.

## Operator matrix

| Operator | String | Integer | Boolean | Date |
| --- | --- | --- | --- | --- |
| =, <> | Yes | Yes | Yes | Yes |
| >, >=, <, <= | No | Yes | No | Yes |
| contains, notcontains, startswith, endswith | Yes | No | No | No |

Direct between, anyof, noneof, LIKE, ILIKE, REGEXP, IN, EXEC, contains_raw and all other operations reject. Fixed SQLAlchemy dispatch only.

## Values, dates, case and NULL

Require actual JSON strings, integers (excluding bool/float, range -2**63 through 2**63-1), and booleans; no coercion. Date requires exact ASCII YYYY-MM-DD and valid Python date parsing, including calendar validation. Reject timestamps, offsets, whitespace, non-padded dates and wrong types. Null only supports =/<> on nullable fields, compiled via is_(None)/is_not(None). Ordinary age <> 30 retains SQL semantics and excludes NULL, unlike local DevExtreme. Reject any NOT subtree referencing nullable age, including explicit null tests, guarded expressions and double negation; propagate nullable metadata through groups and NOT. Explain the SQL/DevExtreme NULL difference in the error. No logical proof or null-complement rewriting.

Use registered expressions and SQLAlchemy and_/or_/not_/typed comparisons. String equality and inequality compare func.lower(column) against func.lower(bound_value). Searches use icontains/istartswith/iendswith(autoescape=True); notcontains negates escaped contains. Escape literal %, _ and the escape character through SQLAlchemy; all user values remain bound data. No SQL text fragments, .op(client_text), eval/exec, dynamic imports, arbitrary model traversal, clause truthiness or Python Boolean clause composition.

## Complexity

MAX_FILTER_DEPTH=16 (root nonempty expression depth 1; each expression array increments). MAX_FILTER_NODES=200 (each condition, NOT and group/wrapper once; not connectors or scalar values). MAX_FILTER_STRING_LENGTH=1024 characters per value. Check budgets before descending/building the next node; bounded child collections only. These limits allow normal admin filters below recursion and usual SQLite binding limits. Do not catch RecursionError. Earlier JSON/Pydantic parsing still requires upstream request-body controls.

## Date-only application transport

Add example-only `examples/remote-fastapi/dateOnlyFilter.ts`, not an npm export. Non-mutating traversal recognizes joined_on condition operands by arity in native groups/NOT. Convert valid Date values with local getFullYear/getMonth/getDate before JSON.stringify; require years 0001–9999. Preserve operators and native exclusive next-day bounds, already date-only strings and unrelated fields. Leave unsupported grammar for backend rejection. Never truncate timestamps or use toISOString().slice(0,10). Generic package cannot know DATE versus DATETIME/timestamp meaning; future datetime fields need separate contracts.

## Installed DevExtreme 26.1.4 evidence

Prior planning read phase materials, backend/tests, remote contracts, basic example and CI. Disposable public ArrayStore and native DataGrid/processed CustomStore probes under jsdom made no source/dependency changes. Basic RemoteCustomerList has ID/string columns; numeric/Boolean/date probes used additional disposable columns. License/theme warnings occurred; no visual browser/live API validation was claimed.

ArrayStore rows 1–4: names Smith, SMITH, Jones, sm%_ith; ages null,30,40,20; active true,false,true,false. String = smith and contains SMI match [1,2]; <> smith and notcontains smith match [3,4]; startswith smi [1,2]; endswith ITH [1,2,4]; literal contains %_ [4]. Equality shorthand works. Adjacent numeric >=30 and active true match [3]. Mixed explicit/implicit AND with OR raises E4019. Direct between raises E4003. Unary NOT works recursively.

| Nullable expression | Local IDs | Backend policy |
| --- | --- | --- |
| age >= 30 | 2,3 | SQL comparison |
| age < 30 | 4 | SQL comparison |
| age = null | 1 | IS NULL |
| age <> null | 2,3,4 | IS NOT NULL |
| age <> 30 | 1,3,4 | SQL excludes NULL; expect 3,4 |
| NOT(age > 30) | 1,2,4 | Reject nullable reference |

Numeric Filter Row >=30 delivers number 30; Boolean equality delivers true. Numeric between [20,40] expands to >=20 AND <=40, not direct between.

Date Filter Row emits Date objects preserved by normalizeLoadOptions (filter reference unchanged). For January 15, 2024, equality emits >=Jan15 AND <Jan16; inequality <Jan15 OR >=Jan16; > becomes >=Jan16; >= remains >=Jan15; < remains <Jan15; <= becomes <Jan16; between Jan15–17 emits >=Jan15 AND <Jan18. Normal JSON.stringify emits UTC timestamps. With Asia/Tokyo local midnight Jan15 serializes as 2024-01-14T15:00:00.000Z; local-component conversion preserves 2024-01-15. Confirm these observations with retained public-API tests during implementation (not private module imports).

SQLite lower() is not full Unicode folding; parity claims are limited. Production may need collations, PostgreSQL citext/provider-specific operators and matching indexes. Function-based comparisons can reduce ordinary-index usefulness. Conservative nullable NOT deliberately rejects even mathematically safe special cases.

## Validation and delivery order

1. Shared registry and metadata/identity/flag/hostile-selector tests, retaining sorting regressions.
2. Typed conditions and pure validation/SQLite execution tests: every allowed/prohibited type/operator pair; shorthand operator-looking literals; strict type/date/null/range tests; searches, wildcards, quotes, SQL-looking bound values; table intact.
3. Recursive groups/NOT with fixed expected IDs; malformed nesting/connectors; nullable references including guarded/double NOT; depth 16/17, nodes near/exactly 200/201 including wrappers, strings 1024/1025. Retain public DevExtreme semantics tests.
4. Query integration and endpoint tests: compile once, same WHERE identity, validation before SQL, no unrequested COUNT, filtered totals before sort/page; seed UK take5 count10; requested active-UK company ASC/name DESC skip5 take5; varied fixture proves genuine sort priorities and ID ties. Keep wire/OpenAPI/extra/page tests. Unexpected exceptions remain server errors. Run backend gates and isolated live Uvicorn smoke with guaranteed cleanup.
5. Date helper/tests, example README, minimal root README, full verification, security/architecture audit and `docs/phase-7-report.md` with exact outcomes.

Live HTTP checks: string, numeric, Boolean, nested AND/OR, filtered count, combined sort/page (repeat deterministically), malformed/unknown-selector 422, hostile literal, date-only success/timestamp 422, nullable-NOT 422. Capture statuses/counts/IDs using isolated temporary data and stop the server.

Root gates: pnpm install --frozen-lockfile; pnpm lint; pnpm format:check; pnpm typecheck; pnpm test; pnpm build; pnpm build:example; pnpm pack --json. Backend: uv sync --locked; uv run ruff check .; uv run ruff format --check .; uv run pytest. Finally git diff --check, git status and git diff; inspect tarball and remove only own generated verification artifacts. No commits, pushes, tags or publishing; leave CI unchanged. Historical 35 Python/~282 frontend counts are not current results.

Report all requested categories: grammar/operators/registry/conversion; mandatory date/case/NULL evidence and cross-checks; SQL/binds/escaping/parser/limits; query pipeline and actual count/combined results; errors/security audit; files/tests/exact counts/live requests/all gates; unchanged types/OpenAPI; deviations/limitations/risks; PRD feedback (no PRD rewrite); recommend separate Phase 7B browser-to-FastAPI example with CORS/launch/docs costs before Phase 8, and assess grouping/summary readiness without implementing either phase.
