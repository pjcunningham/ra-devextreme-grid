# Phase 6 Finalized Design — FastAPI + SQLModel Reference Backend

## Executive Summary
Phase 6 establishes a reference backend in Python using **FastAPI** and **SQLModel**, managed exclusively via **UV** (`pyproject.toml`, `uv.lock`, `.python-version`). It provides a lightweight, robust, and secure server-side implementation fulfilling the React-Admin remote grid contract established in Phase 5 (`DatagridDXRemote`, `createGridStore`, and `dataProvider.getGrid(resource, { loadOptions })`).

## Python Environment & Dependencies
- **Python**: 3.13 (pinned via `.python-version = "3.13"` and `requires-python = ">=3.13"`).
- **FastAPI**: 0.141.1
- **SQLModel**: 0.0.42
- **Pydantic**: 2.13.5
- **SQLAlchemy**: 2.0.52
- **Uvicorn**: 0.52.4
- **Pytest**: 9.1.1
- **Ruff**: 0.16.7
- **HTTPX**: 0.28.1
- **UV**: Managed via `astral-sh/setup-uv@v5` in GitHub Actions.

## UV Project Layout
The backend is located under `examples/remote-fastapi/backend/` and operates as an independent UV application:
```text
examples/remote-fastapi/
├── README.md
└── backend/
    ├── .python-version
    ├── pyproject.toml
    ├── uv.lock
    ├── app/
    │   ├── __init__.py
    │   ├── main.py            # FastAPI factory, lifespan, routes, error handlers
    │   ├── database.py        # SQLite engine & session dependency
    │   ├── models.py          # CustomerBase, Customer (table), CustomerRead
    │   ├── seed.py            # Idempotent deterministic customer seeder
    │   └── grid/
    │       ├── __init__.py
    │       ├── models.py      # GridRequest, GridLoadOptions, GridResponse, GridSortDescriptor
    │       ├── fields.py      # CUSTOMER_GRID_FIELDS whitelist, GridQueryError
    │       └── query.py       # execute_customer_grid_query (SQL execution)
    └── tests/
        ├── conftest.py        # StaticPool test engine & TestClient fixtures
        ├── test_api.py        # HTTP endpoint integration tests & OpenAPI schema
        ├── test_grid_models.py# Wire model parsing, alias, and validation tests
        ├── test_grid_fields.py# Field registry security tests
        └── test_grid_query.py # Database sorting, paging, count, and filter rejection tests
```

## Database Model & Seed Data
- **Customer Model** (`app/models.py`):
  - `id`: integer primary key (`int | None` on table, non-null `int` on `CustomerRead`).
  - `name`: string, indexed.
  - `company`: string, indexed.
  - `city`: string, indexed.
  - `country`: string, indexed.
  - `active`: boolean, default `True`, indexed.
  - `age`: nullable integer (`int | None`).
  - `joined_on`: date.
- **SQLite Strategy**:
  - Development SQLite database at `data/customers.db` (git-ignored).
  - Tests use ephemeral in-memory SQLite (`sqlite:///:memory:`) with `StaticPool` and `check_same_thread = False`.
- **Deterministic Seeding** (`app/seed.py`):
  - Idempotently populates 100 customer records from fixed lists and predictable attribute combinations.
  - Guaranteed identical records across environments and runs.
  - Bypasses seeding if records already exist.

## Wire Models & Aliasing Strategy
- **Pydantic v2 Models** (`app/grid/models.py`):
  - Request models use `extra = "forbid"` and `populate_by_name = True`.
  - CamelCase aliases map exact TypeScript contract properties:
    - `loadOptions` -> `load_options`
    - `requireTotalCount` -> `require_total_count`
    - `totalCount` -> `total_count`
  - Response serialization uses `response_model_exclude_unset = True`.
    - `totalCount` is excluded completely when unrequested (`requireTotalCount` is false/omitted).
    - Nullable customer values like `age: null` are preserved because they are explicitly set.

## Field Registry Security Boundary
- Selectors resolve against the whitelist `CUSTOMER_GRID_FIELDS`:
  - `{"id", "name", "company", "city", "country", "active", "age", "joined_on"}`
- Any unknown selector, dotted traversal (`customer.name`), dunder (`__class__`), or SQL injection payload raises `GridQueryError` and is rejected with HTTP 422 before executing SQL.
- No `getattr()` or raw SQL assembly is used.

## SQL Query Engine
- **Sorting**:
  - Multi-column `ORDER BY` applying `.asc()` or `.desc()` based on descriptor order.
  - Automatic deterministic `Customer.id.asc()` tie-breaker appended unless `id` is explicitly sorted.
  - Default ordering is `Customer.id.asc()` when sort descriptors are omitted.
- **Paging**:
  - `OFFSET :skip` and `LIMIT :take` applied directly at the database level.
  - Default page size: `DEFAULT_PAGE_SIZE = 20`.
  - Server maximum page size: `MAX_PAGE_SIZE = 100`.
- **Total Count**:
  - Executed via `select(func.count(Customer.id))` only when `requireTotalCount: true`.
- **Filter Safeguard**:
  - `null` and `[]` accepted as no active filter.
  - Any non-empty filter raises `GridQueryError` and returns HTTP 422:
    `"Remote filtering is not implemented by the Phase 6 reference backend; Phase 7 adds the secure filter compiler."`

## Testing & Quality Assurance
- 35 automated tests covering:
  - Wire model camelCase parsing, defaults, bounds, and unknown field rejection.
  - Field whitelist resolution and hostile string defense.
  - Paging, multi-column sorting, deterministic tie-breakers, and conditional counts.
  - Filter rejection and Phase 7 guidance message.
  - HTTP endpoint integration and OpenAPI schema verification.
  - Structural test confirming sorting, paging, and counting compile into SQL clauses.
- Full formatting and linting compliance with Ruff.
- Continuous Integration in `.github/workflows/ci.yml` via `astral-sh/setup-uv@v5`.
