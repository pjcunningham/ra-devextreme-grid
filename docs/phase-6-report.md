# Phase 6 Report — FastAPI + SQLModel Reference Backend

### Implementation summary

Phase 6 implements the reference backend for `ra-devextreme-grid` in Python using **FastAPI** and **SQLModel** managed exclusively with **UV**. It delivers database-level paging, multi-column SQL sorting, deterministic tie-breaking, conditional total counts, and strict request/response models mirroring the Phase 5 TypeScript remote contract. Remote filtering is explicitly deferred to Phase 7 and fails closed with an informative HTTP 422 error.

### Python environment

- **Python**: 3.13.12 (CPython, pinned via `.python-version = "3.13"` and `requires-python = ">=3.13"`)
- **UV**: 0.10.9 (CI uses `astral-sh/setup-uv@v5`)
- **FastAPI**: 0.141.1
- **SQLModel**: 0.0.42
- **Pydantic**: 2.13.5
- **SQLAlchemy**: 2.0.52
- **Uvicorn**: 0.52.4
- **Pytest**: 9.1.1
- **Ruff**: 0.16.7
- **HTTPX**: 0.28.1

### Repository structure

```text
examples/remote-fastapi/
├── README.md
└── backend/
    ├── .python-version
    ├── pyproject.toml
    ├── uv.lock
    ├── app/
    │   ├── __init__.py
    │   ├── main.py
    │   ├── database.py
    │   ├── models.py
    │   ├── seed.py
    │   └── grid/
    │       ├── __init__.py
    │       ├── models.py
    │       ├── fields.py
    │       └── query.py
    └── tests/
        ├── conftest.py
        ├── test_api.py
        ├── test_grid_models.py
        ├── test_grid_fields.py
        └── test_grid_query.py
```

### HTTP contract

- **Endpoint**: `POST /api/customers/grid`
- **Request Wire Model**: `GridRequest` wrapping `loadOptions: GridLoadOptions`
  - `skip`: non-negative integer (default 0)
  - `take`: integer `> 0` and `<= 100` (default 20, max 100)
  - `requireTotalCount`: optional boolean
  - `sort`: optional list of `GridSortDescriptor` (`selector: str`, `desc: bool`)
  - `filter`: optional `null`, `[]`, or nested `list[JsonValue]`
  - `extra = "forbid"` rejects unknown keys at all levels
- **Response Wire Model**: `GridResponse`
  - `data`: list of serialized `CustomerRead` objects
  - `totalCount`: integer, conditionally included if and only if `requireTotalCount` was true

#### Example Request

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 2,
    "requireTotalCount": true,
    "sort": [
      { "selector": "country", "desc": false },
      { "selector": "name", "desc": false }
    ]
  }
}
```

#### Example Response

```json
{
  "data": [
    {
      "id": 16,
      "name": "Frank Johnson",
      "company": "Stark Industries",
      "city": "Sydney",
      "country": "Australia",
      "active": true,
      "age": 47,
      "joined_on": "2021-07-30"
    },
    {
      "id": 26,
      "name": "Frank Williams",
      "company": "Initech",
      "city": "Sydney",
      "country": "Australia",
      "active": true,
      "age": 37,
      "joined_on": "2021-12-17"
    }
  ],
  "totalCount": 100
}
```

### TypeScript contract compatibility

- `GetGridParams` / `GetGridLoadOptions` / `GetGridResult` directly map to Pydantic models through camelCase aliases (`loadOptions`, `requireTotalCount`, `totalCount`).
- `extra = "forbid"` ensures that any unexpected properties (e.g. `group`) are caught immediately.
- Date boundary: JavaScript runtime `Date` objects become ISO-8601 strings when stringified over HTTP JSON. The backend parses and renders `joined_on` as ISO-8601 strings (`YYYY-MM-DD`).

### Database model

`Customer` table in `app/models.py`:

- `id`: integer primary key (`int | None` on table, non-null `int` on `CustomerRead`)
- `name`: string, indexed
- `company`: string, indexed
- `city`: string, indexed
- `country`: string, indexed
- `active`: boolean, default `True`, indexed
- `age`: nullable integer (`int | None`)
- `joined_on`: date

### Field registry

- Whitelist `CUSTOMER_GRID_FIELDS` maps `{"id", "name", "company", "city", "country", "active", "age", "joined_on"}` to SQLModel table column attributes.
- Any unknown, dotted, dunder, or SQL injection string raises `GridQueryError` and is rejected with HTTP 422 before touching the database.
- Dynamic `getattr()` and raw SQL strings are strictly prohibited.

### Paging

- Database-level `OFFSET :skip` and `LIMIT :take` execution.
- Defaults: `skip=0`, `take=20`. Server cap: `MAX_PAGE_SIZE = 100`.
- Out of bounds or negative values fail with HTTP 422.

### Total count

- `requireTotalCount: true` executes `SELECT COUNT(customer.id) FROM customer` and populates `totalCount`.
- When `requireTotalCount` is false or omitted, the count query is skipped and `"totalCount"` is omitted from the JSON output.

### Sorting

- Multi-column ordering applies `.asc()` / `.desc()` according to descriptor order.
- Deterministic tie-breaker: `Customer.id.asc()` is appended automatically unless `id` is explicitly sorted by the client.
- When no sort descriptors are given, ordering defaults to `Customer.id.asc()`.

### Filtering status

- `filter=null` and `filter=[]` are accepted as no active filter.
- Any non-empty filter raises `GridQueryError` and returns HTTP 422:
  `"Remote filtering is not implemented by the Phase 6 reference backend; Phase 7 adds the secure filter compiler."`

### Error behaviour

- Structural Pydantic validation errors -> HTTP 422 Unprocessable Entity.
- Unknown selector / page size violation / non-empty filter -> HTTP 422 with structured detail.

### Seed database

- Idempotently populates 100 customer records from fixed lists and deterministic permutations.
- Checked via `COUNT(*)` so restarts never duplicate records.
- Ephemeral in-memory SQLite (`StaticPool`) is used in test runs to isolate test cases.

### Tests

- `tests/test_grid_models.py`: Wire model aliases, defaults, bounds, and unknown field rejection (9 tests).
- `tests/test_grid_fields.py`: Field whitelist resolution and hostile selector tests (5 tests).
- `tests/test_grid_query.py`: Sorting, paging, tie-breakers, counts, filter rejection, and SQL compilation inspection (14 tests).
- `tests/test_api.py`: FastAPI endpoint status codes, response shapes, error handlers, and OpenAPI schema (7 tests).

### Python test count

- Exactly **35 passed tests** in `0.24s`.

### Frontend regression status

- Full frontend verification suite passed cleanly:
  - `pnpm lint`: passed
  - `pnpm format:check`: passed
  - `pnpm typecheck`: passed
  - `pnpm test`: all 13 test files passed, **282/282 tests passed**
  - `pnpm build`: passed
  - `pnpm build:example`: passed
  - `pnpm pack --json`: passed

### SQL processing evidence

- Architectural test `test_sql_level_execution_architectural` compiles query statements and verifies that `ORDER BY customer.country ASC, customer.id ASC`, `OFFSET 10`, and `LIMIT 15` clauses exist at the database level.
- No `session.exec(select(Customer)).all()` full-table fetching is used in query logic.

### Security review

- Whitelist registry prevents SQL injection and attribute traversal.
- Server-enforced page limits prevent denial-of-service allocations.
- `extra = "forbid"` blocks injection of unexpected parameters.
- Unsupported filters fail closed.

### OpenAPI inspection

- OpenAPI schema at `/openapi.json` uses camelCase wire properties (`loadOptions`, `requireTotalCount`, `data`, `totalCount`).

### CI

- `.github/workflows/ci.yml` updated with `verify-python` job using `astral-sh/setup-uv@v5`, running `uv sync --locked`, `uv run ruff check .`, `uv run ruff format --check .`, and `uv run pytest`.

### Documentation

- `examples/remote-fastapi/README.md` documents setup, API usage, curl examples, and React-Admin DataProvider integration.
- Root `README.md` updated with Phase 6 status and roadmap link.

### Smoke verification

- Uvicorn test execution demonstrated clean startup, `/docs` serving (200), `/openapi.json` serving (200), successful grid query execution (200), and clean shutdown.

### Deviations from plan

- None.

### Known limitations

- Remote filter compiler is not implemented (deferred to Phase 7).
- Grouping, summaries, and group paging are deferred to Phase 8.
- Inline editing is deferred to Phase 10.
- State persistence is deferred to Phase 9.
- No authentication or migrations (reference demo only).

### PRD feedback

- None. The PRD specifications for Phase 6 map cleanly to modern FastAPI, SQLModel, and Pydantic v2.

### Phase 7 readiness

- The `app/grid/` module, `CUSTOMER_GRID_FIELDS` registry, and `execute_customer_grid_query` architecture provide a clean, isolated foundation for introducing the recursive filter compiler in Phase 7.
