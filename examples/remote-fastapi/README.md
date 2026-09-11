# FastAPI Reference Backend for `ra-devextreme-grid`

This directory contains a reference implementation of a server-side remote grid backend built with **FastAPI** and **SQLModel**, managed exclusively with **UV**.

It demonstrates how server-side pagination, multi-column SQL sorting, conditional total counts, and strict request validation fulfill the remote contract established in Phase 5 (`DatagridDXRemote` and `dataProvider.getGrid(resource, { loadOptions })`).

---

## Architecture Overview

```text
React-Admin UI (<DatagridDXRemote>)
    │
    ▼
DevExtreme CustomStore (createGridStore)
    │
    ▼
React-Admin dataProvider.getGrid("customers", { loadOptions })
    │
    ▼ POST /api/customers/grid
FastAPI Endpoint (app.main:app)
    │
    ▼ Validate JSON Wire Schema (Pydantic v2 GridRequest, extra="forbid")
Field Whitelist Registry (app.grid.fields:CUSTOMER_GRID_FIELDS)
    │
    ▼ SQL Query Compilation (ORDER BY ..., OFFSET :skip LIMIT :take)
SQLite Database (SQLModel Customer table)
```

### Key Highlights

- **Server-Side Paging**: Evaluated at the database level with SQL `OFFSET` and `LIMIT`.
- **Multi-Column SQL Sorting**: Preserves client descriptor order and appends `Customer.id.asc()` as a deterministic tie-breaker.
- **Conditional Total Count**: Runs `SELECT COUNT(*)` only when `requireTotalCount: true`, omitting `totalCount` when not requested to conserve database resources.
- **Security Whitelist**: Resolves client sort selectors strictly against `CUSTOMER_GRID_FIELDS`. Hostile selectors, dotted lookups, dunders, or SQL injections are rejected without executing SQL.
- **Strict Wire Validation**: Rejects unknown properties (`extra = "forbid"`) to prevent silent contract drift.
- **Filter Safeguard**: Deliberately rejects non-empty filter expressions with HTTP 422. Full remote filter compilation is introduced in Phase 7.

---

## Getting Started

### Prerequisites

- [UV](https://github.com/astral-sh/uv) (v0.5+)
- Python 3.13+ (automatically provisioned by UV if needed)

### Running the Backend

```bash
cd examples/remote-fastapi/backend

# Synchronize dependencies from lockfile
uv sync --locked

# Start the development server with live reload
uv run uvicorn app.main:app --reload
```

The service will start at `http://127.0.0.1:8000`. On first launch, it automatically creates the SQLite database under `data/customers.db` and idempotently seeds 100 customer records.

Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

### Running Tests & Linting

```bash
cd examples/remote-fastapi/backend

# Run Pytest suite (35 isolated tests)
uv run pytest

# Check code quality and formatting
uv run ruff check .
uv run ruff format --check .
```

---

## API Reference

### `POST /api/customers/grid`

#### Request Body

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 10,
    "requireTotalCount": true,
    "sort": [
      {
        "selector": "country",
        "desc": false
      },
      {
        "selector": "name",
        "desc": false
      }
    ]
  }
}
```

#### Curl Example

```bash
curl -X POST http://127.0.0.1:8000/api/customers/grid \
  -H "Content-Type: application/json" \
  -d '{
    "loadOptions": {
      "skip": 0,
      "take": 2,
      "requireTotalCount": true,
      "sort": [
        {"selector": "country", "desc": false},
        {"selector": "name", "desc": false}
      ]
    }
  }'
```

#### Successful Response (HTTP 200)

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

_Note_: If `requireTotalCount` is omitted or `false`, the `"totalCount"` field is omitted from the JSON response.

---

## React-Admin DataProvider Integration

Below is an example showing how an application DataProvider implements `getGrid` to communicate with this endpoint:

```typescript
import simpleRestProvider from 'ra-data-simple-rest';
import type { DatagridDXDataProvider, GetGridLoadOptions } from 'ra-devextreme-grid';

const baseDataProvider = simpleRestProvider('http://127.0.0.1:8000/api');

export const dataProvider: DatagridDXDataProvider = {
  ...baseDataProvider,

  async getGrid(resource: string, { loadOptions }: { loadOptions: GetGridLoadOptions }) {
    // Map React-Admin resource name to the appropriate backend endpoint
    const endpointMap: Record<string, string> = {
      customers: 'http://127.0.0.1:8000/api/customers/grid',
      'remote-customers': 'http://127.0.0.1:8000/api/customers/grid',
    };

    const targetUrl = endpointMap[resource];
    if (!targetUrl) {
      throw new Error(`Unsupported grid resource: ${resource}`);
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ loadOptions }),
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

### Date Handling Boundary

In JavaScript/TypeScript, dates can exist as runtime `Date` instances. When sent over HTTP via `JSON.stringify`, dates are serialized as ISO-8601 strings (e.g. `"2021-07-30"`). The backend parses and serves these values as ISO-8601 strings matching the wire contract.

---

## Phase 6 Limitations & Upcoming Phases

- **Remote Filtering (Phase 7)**: Non-empty filters currently return HTTP 422:
  `"Remote filtering is not implemented by the Phase 6 reference backend; Phase 7 adds the secure filter compiler."`
  Phase 7 will introduce an AST compiler mapping DevExtreme filter syntax into parameterized SQLAlchemy expressions.
- **Grouping & Summaries (Phase 8)**: Group paging and server-side summaries are deferred to Phase 8.
- **Mutations & Inline Editing (Phase 10)**: Read-only reference implementation; mutations will be implemented in Phase 10.
- **Authentication & RBAC**: The reference backend demonstrates grid mechanics only. Production systems must layer application-specific authentication/authorization middleware.
