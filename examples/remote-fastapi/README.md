# FastAPI Reference Backend for `ra-devextreme-grid`

This **FastAPI + SQLModel**, **UV**-managed example implements server-side paging, ordered multi-column sorting, secure remote filtering, conditional **filtered** totals, and strict request validation for `DatagridDXRemote` / `dataProvider.getGrid()`.

It is a read-only reference backend, not a production deployment or a wired browser application. See the [Phase 7 report](../../docs/phase-7-report.md) for executed tests, native DevExtreme evidence, HTTP results and limitations.

## Getting Started

Requires [UV](https://github.com/astral-sh/uv) (v0.5+) and Python 3.13+ (UV can provision Python).

```sh
cd examples/remote-fastapi/backend
uv sync --locked
uv run uvicorn app.main:app --reload
```

The server listens at `http://127.0.0.1:8000`; interactive OpenAPI documentation is at `/docs`. First startup creates `backend/data/customers.db` and idempotently seeds 100 customers. Tests use isolated SQLite engines and do not alter this database.

```sh
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

## Query Pipeline and Wire Contract

```text
DevExtreme native filter (possibly containing Date objects)
  -> application getGrid transport normalizes known DATE operands
  -> JSON POST /api/customers/grid
  -> Pydantic GridRequest (extra="forbid")
  -> validate ordered sorts + compile filter once using shared field registry
  -> one SQLAlchemy WHERE expression
       -> filtered COUNT when requested
       -> Customer SELECT -> ORDER BY -> OFFSET -> LIMIT
  -> { data, totalCount? }
```

- Request envelope stays `{ "loadOptions": { ... } }`. Supported properties remain `skip`, `take`, `requireTotalCount`, `sort`, and `filter`.
- TypeScript remains `filter?: unknown[] | null`; Python remains `filter: list[JsonValue] | None`. The generic adapter preserves native expressions; the backend performs semantic validation. No new endpoint or managed-filter suffix DSL.
- Omitted/null `skip` defaults to 0; omitted/null `take` defaults to 20. `skip >= 0`, `1 <= take <= 100`; existing paging validation is unchanged.
- Sort descriptors are ordered `{ "selector": "company", "desc": false }` entries. Default order is `id ASC`; append `id ASC` when no explicit ID sort exists. Explicit `id DESC` remains respected.
- Count runs only for `requireTotalCount: true`. Otherwise `totalCount` is omitted, not null. Record nulls such as `age: null` remain present.
- Sorting and filtering validate before either query executes. The same compiled expression object is reused for count and data; no in-memory post-page filtering.

## Supported Filter Grammar

```text
condition := [selector, value] | [selector, operator, value]
not       := ["!", expression]
group     := [expression]
           | [expression, "and", expression, ...]
           | [expression, "or", expression, ...]
           | [expression, expression, ...]
```

Top-level `null`, `[]`, or an absent filter means no WHERE clause. Nested empty arrays are invalid. Single-child wrappers are supported and count toward complexity limits.

Two-item conditions use native equality shorthand **by length**, not by inspecting the second item: `["country", "UK"]`, `["active", true]`, and `["age", null]` mean equality. `["country", "="]` means country equals the literal string `"="`; `["!", ["country", "="]]` is also valid. One-item conditions and extra operands reject.

Adjacent child expressions imply `and`. Explicit and implicit AND may coexist. Each group level must use only AND or only OR; nest different connectors explicitly. Flat `A and B or C` and `A B or C` reject, matching native DevExtreme `E4019`. Only exact lowercase `and`, `or`, and unary `!` are accepted. Leading/trailing/repeated connectors, scalar children, malformed NOT and custom structures reject.

### Operators by Type

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

No direct `between`: DevExtreme 26.1.4 numeric Filter Row ranges arrive as `>= lower AND <= upper`; date ranges arrive with an exclusive next-day upper bound. These native comparisons are supported without changing their boundaries. `anyof`, `noneof`, `LIKE`, `ILIKE`, `REGEXP`, `IN`, `EXEC`, `contains_raw`, and all unknown/custom operators reject.

### Shared Field Registry and Values

`app/grid/fields.py` defines immutable `GridField(expression, value_type, sortable, filterable, nullable)` metadata. Both sort and filter use this explicit registry; all eight current fields are sortable and filterable.

| Fields                               | Type    | Nullable                   |
| ------------------------------------ | ------- | -------------------------- |
| `id`                                 | INTEGER | No (persisted primary key) |
| `name`, `company`, `city`, `country` | STRING  | No                         |
| `active`                             | BOOLEAN | No                         |
| `age`                                | INTEGER | Yes                        |
| `joined_on`                          | DATE    | No                         |

- Strings must be actual JSON strings; no stringification of objects or numbers.
- Integers must be actual JSON integers in `[-2^63, 2^63-1]`. Booleans, floats (including `30.0`), and numeric strings reject.
- Booleans must be actual JSON `true`/`false`, not `0`, `1`, or strings. Native numeric/Boolean Filter Row values already have these types.
- Dates must be exact ASCII `YYYY-MM-DD` and valid calendar dates (years 0001–9999). They are parsed to Python `date` before SQL construction. Timestamps, offsets, non-padded dates, whitespace and impossible dates reject.
- Null is allowed only with `=` / `<>` on nullable fields. `["age", "=", null]` compiles to `IS NULL`; `["age", "<>", null]` to `IS NOT NULL`. Other null operations and null on non-nullable fields reject.

Selectors determine SQL structure and therefore come **only** from registered expressions. Unknown, dotted, dunder, SQL-looking and managed suffix selectors such as `name_q` / `age_gte` reject rather than being sanitized or traversed.

### NULL and NOT: Deliberate Restrictions

Ordinary nullable comparisons use SQL semantics. In particular, `age <> 30` **excludes NULL**, whereas DevExtreme's local ArrayStore includes it. This is an intentional difference, not a parity guarantee.

Unary NOT works over non-nullable fields and nested groups. However, the compiler conservatively rejects NOT over **any subtree referencing nullable `age`**, including null checks, double negation and apparently guarded cases. DevExtreme negates two-valued JavaScript results; SQL can produce UNKNOWN. For ages `[null, 30, 40, 20]`, native `NOT(age > 30)` includes the null row; ordinary SQL would not. The compiler does not attempt null-complement rewrites or logical proofs, even for special cases that could be safe.

### String Case, Binding and Literal Wildcards

All six string operators are intentionally case-insensitive. Equality/inequality compare `lower(column)` against `lower(bound_value)`; searches use SQLAlchemy `icontains`, `istartswith`, and `iendswith` with `autoescape=True`. `notcontains` negates escaped contains.

User text `%`, `_`, and the escape character `/` are literal search data, not wildcard syntax. Quotes and SQL-looking values are bound parameters and cannot choose SQL structure. There is no client-built SQL text, dynamic `.op()`, model traversal, `eval`, or `exec`.

Native ArrayStore and SQLite agree for the tested ASCII examples. **SQLite `lower()` is not full Unicode case folding.** Production applications should select appropriate collations, PostgreSQL `citext`, provider-specific operators and matching indexes. `lower(column)` can reduce ordinary-index usefulness; this example adds no database-specific optimization.

### Limits and Errors

| Limit                      | Value | Accounting                                            |
| -------------------------- | ----- | ----------------------------------------------------- |
| `MAX_FILTER_DEPTH`         | 16    | Root depth 1; each nested expression array increments |
| `MAX_FILTER_NODES`         | 200   | Every condition, NOT and group/wrapper counts once    |
| `MAX_FILTER_STRING_LENGTH` | 1024  | Characters per individual string value                |

Connectors and scalar operands are not separate nodes. Budgets are checked before compiling the next node, not by catching `RecursionError`. The bounds accommodate ordinary admin filters while limiting generated clauses/binds. **These are compiler limits, not an HTTP body-size guarantee**: JSON/Pydantic parsing happens first. Deployments need upstream body-size limits, request/query timeouts and appropriate access controls.

Deliberate semantic validation failures use the existing HTTP 422 envelope, for example:

```json
{
  "detail": [
    {
      "msg": "Unary NOT is not supported for nullable field 'age' because DevExtreme and SQL NULL semantics differ.",
      "type": "grid_query_error"
    }
  ]
}
```

Other examples: `Unknown filter selector: 'password_hash'`, invalid date (expected `YYYY-MM-DD`), unsupported operator/type, trailing connector or exceeded budget. Errors do not expose compiled SQL, connections or stack traces. Pydantic structural errors retain their normal 422 shape; unexpected database/programming exceptions are not blanket-converted to validation errors.

## Successful Curl Examples

The following POSIX-shell examples use seeded values (in PowerShell, use `Invoke-RestMethod` with `ConvertTo-Json -Depth 30`, or adapt quoting for `curl.exe`). Results below were verified against isolated copies of the 100-row seed; a locally modified database can differ.

```sh
curl -X POST http://127.0.0.1:8000/api/customers/grid \
  -H 'Content-Type: application/json' \
  -d '{"loadOptions":{"skip":0,"take":5,"requireTotalCount":true,"filter":["country","=","UK"]}}'
```

Returns five Customer records with IDs `[8,18,28,38,48]` and **`totalCount: 10`**, not 100 or 5.

```sh
curl -X POST http://127.0.0.1:8000/api/customers/grid \
  -H 'Content-Type: application/json' \
  -d '{"loadOptions":{"take":20,"requireTotalCount":true,"filter":[["active","=",true],"and",[["country","=","UK"],"or",["country","=","France"]]]}}'
```

Returns IDs `[7,8,18,27,28,38,47,48,58,67,68,78,87,88,98]`, **`totalCount: 15`**.

Combined filter, multi-sort and paging:

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

Returns IDs `[48,18,58,78,38]`, **`totalCount: 10`**, identically on repeated requests. Seeded UK customers share one company; additional automated fixtures vary both sort keys and include ties to prove sort precedence and ID tie-breaking.

## React-Admin DataProvider Integration

This is application transport guidance, **not browser-to-FastAPI wiring**. The basic example still uses its in-memory provider. CORS and launch/origin configuration are not added here. The non-grid methods in `baseDataProvider` must point at real application endpoints; this backend implements only the read-only grid endpoint.

Copy/use the example-local [date helper](./dateOnlyFilter.ts) alongside your provider (it is **not** an npm package export):

```typescript
import simpleRestProvider from 'ra-data-simple-rest';
import type { DatagridDXDataProvider, GetGridLoadOptions } from 'ra-devextreme-grid';
import { normalizeDateOnlyFilter } from './dateOnlyFilter';

const baseDataProvider = simpleRestProvider('http://127.0.0.1:8000/api');

export const dataProvider: DatagridDXDataProvider = {
  ...baseDataProvider,

  async getGrid(resource: string, { loadOptions }: { loadOptions: GetGridLoadOptions }) {
    const endpointMap: Record<string, string> = {
      customers: 'http://127.0.0.1:8000/api/customers/grid',
      'remote-customers': 'http://127.0.0.1:8000/api/customers/grid',
    };
    const targetUrl = endpointMap[resource];
    if (!targetUrl) throw new Error(`Unsupported grid resource: ${resource}`);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loadOptions: {
          ...loadOptions,
          filter: normalizeDateOnlyFilter(loadOptions.filter),
        },
      }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail?.[0]?.msg || `Grid request failed with status ${response.status}`
      );
    }
    return response.json();
  },
};
```

### Date Handling Boundary: Calendar Date, Not Instant

The installed DevExtreme **26.1.4** DataGrid sends **Date objects** for date Filter Row conditions. `normalizeLoadOptions()` preserves the filter reference, so the DataProvider sees those same objects. Ordinary `JSON.stringify(Date)` emits a **UTC timestamp**, not a date-only string. For example, Tokyo local midnight January 15 serializes as `2024-01-14T15:00:00.000Z`: truncating it would select the wrong date.

```text
DevExtreme Date
  -> application transport normalizes known joined_on DATE operands
  -> "YYYY-MM-DD"
  -> FastAPI parses Python date
  -> SQL DATE comparison
```

`normalizeDateOnlyFilter()` non-mutatingly traverses native expression arrays, converts only direct `joined_on` Date operands using **local** `getFullYear()`, `getMonth()`, `getDate()` components, and validates Date validity and years 0001–9999. Shorthand, groups and NOT retain their shape. Existing strings and unrelated fields are untouched; timestamp strings still reach backend rejection. Unsupported grammar is not rewritten into supported expressions.

Normalize **before** `JSON.stringify()`, not by truncating UTC timestamps or relying on a JSON replacer after `Date.toJSON()`. Never use `toISOString().slice(0, 10)` for this DATE contract. The application's intended calendar must match the local components of its Date values.

Native day comparisons for a January 15, 2024 Filter Row input are:

| Operation               | Native bounds (shown after date-only normalization) |
| ----------------------- | --------------------------------------------------- |
| `=`                     | `>= 2024-01-15 AND < 2024-01-16`                    |
| `<>`                    | `< 2024-01-15 OR >= 2024-01-16`                     |
| `>`                     | `>= 2024-01-16`                                     |
| `>=`                    | `>= 2024-01-15`                                     |
| `<`                     | `< 2024-01-15`                                      |
| `<=`                    | `< 2024-01-16`                                      |
| `between` January 15–17 | `>= 2024-01-15 AND < 2024-01-18`                    |

Preserve these operators and exclusive next-day bounds exactly. Do not expand dates again on the server. SQL DATE `joined_on` accepts only `YYYY-MM-DD`; **full timestamps reject** rather than being truncated or implicitly converted. Future DATETIME/timestamp fields require separate, explicit wire semantics. The generic npm package must not guess what a field means.

## Limitations and Next Phases

- No `anyof`/`noneof`, direct `between`, Header Filter distinct values, Search Panel, Filter Builder UI enablement, grouping, summaries, group paging, relationships, editing or state persistence.
- No authentication/RBAC, CORS, browser application wiring, arbitrary-resource framework or Python package extraction. Add deployment/access controls in your application.
- SQLite Unicode/collation limitations, ordinary nullable inequality differences, conservative nullable NOT, and application-local date semantics are intentional qualifications to native parity.
- Recommend a separate **Phase 7B — Browser-to-FastAPI End-to-End Example** before Phase 8: exercise real date transport, Filter Row/network requests and displayed errors. Budget separately for CORS, coordinated launch configuration and documentation.
- The registry/compiler/query split is a foundation for Phase 8 grouping and summaries, but advanced request/result contracts and aggregation semantics still need design. Neither Phase 7B nor Phase 8 is implemented here.
