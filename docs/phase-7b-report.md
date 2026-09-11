# Phase 7B Report — Browser-to-FastAPI End-to-End Integration

## Implementation summary

Phase 7B establishes and proves complete browser-to-FastAPI end-to-end integration for `ra-devextreme-grid`. It connects the React-Admin remote grid component (`DatagridDXRemote`) to a real SQLite-backed FastAPI reference backend over HTTP connections with local development CORS.

Key additions:

- **Dedicated Frontend Example (`examples/remote-fastapi/frontend/`)**: A clean React-Admin application mounting `DatagridDXRemote` directly inside `<Resource name="remote-customers" />` without `<List>` or `getList()` wrapping.
- **Real HTTP DataProvider (`examples/remote-fastapi/frontend/src/dataProvider.ts`)**: Implements `DatagridDXDataProvider`, routing `remote-customers` to `POST /api/customers/grid`, non-mutatingly normalizing dates, parsing FastAPI 422 error details, and rejecting unused CRUD operations honestly.
- **Backend CORS & Isolation**: Configured FastAPI `CORSMiddleware` for strict development origins (`http://127.0.0.1:5174` and `http://localhost:5174`) with allowed methods `POST` and `OPTIONS` and header `Content-Type`. Added `GRID_DATABASE_URL` environment support for disposable SQLite database isolation.
- **Playwright Chromium E2E Suite (`tests/e2e/grid.spec.ts`)**: Configured dual `webServer` lifecycle orchestration (Vite on 5174, FastAPI on 8000), fixed `Asia/Tokyo` timezone, and implemented 13 automated browser interaction scenarios.
- **CI Workflow Integration (`.github/workflows/ci.yml`)**: Added an isolated `e2e` runner job installing Chromium, running E2E tests, and capturing failure artifacts.
- **Package Cleanliness**: Confirmed that no frontend examples, backend files, E2E tests, or SQLite databases leak into the distribution tarball (`pnpm pack`).

## Browser architecture

```text
Browser (Chromium in Asia/Tokyo)
    │
    ▼
React 19 / React-Admin 5 (<Resource name="remote-customers" list={RemoteCustomerList} />)
    │
    ▼
DatagridDXRemote (defaultPaging, sorting="multiple", filterRow, loadPanel, cacheEnabled=false)
    │
    ▼
DevExtreme CustomStore (loadMode="processed", key="id")
    │
    ▼
dataProvider.getGrid("remote-customers", { loadOptions })
    │
    ▼
normalizeDateOnlyFilter() (transforms joined_on Date instances to local YYYY-MM-DD strings)
    │
    ▼
fetch("http://127.0.0.1:8000/api/customers/grid", { method: "POST", headers: { "Content-Type": "application/json" } })
    │
    ▼
CORSMiddleware (Origin verification: 127.0.0.1:5174 / localhost:5174, methods: POST/OPTIONS)
    │
    ▼
FastAPI Router -> Pydantic GridRequest validation
    │
    ▼
SQLModel / SQLAlchemy Query Compiler (app/grid/query.py, fields.py, filtering.py)
    │
    ▼
SQLite Engine (disposable e2e_customers.db initialized with 100 deterministic seed records)
    │
    ▼
FastAPI JSON Response: { "data": [...], "totalCount": 100 } (or HTTP 422 error detail)
    │
    ▼
dataProvider.getGrid resolves { data, totalCount } (or throws Error)
    │
    ▼
CustomStore updates internal buffer / onDataErrorOccurred fires
    │
    ▼
DevExtreme DataGrid UI renders rows, pager, and column indicators; accessible alert container displays errors
```

## Frontend example

The dedicated frontend example is located under `examples/remote-fastapi/frontend/` and reuses the root pnpm project dependencies (React, React-Admin, DevExtreme, Vite).

`examples/basic/` was intentionally retained without modification. The basic example serves as a lightweight, zero-dependency demo showcasing managed `DatagridDX` alongside an in-memory `DatagridDXRemote` without requiring a Python environment. The new `examples/remote-fastapi/frontend/` focuses purely on real HTTP networking, real FastAPI execution, and real date transport normalization.

## HTTP DataProvider

The frontend example implements `DatagridDXDataProvider` in `examples/remote-fastapi/frontend/src/dataProvider.ts`:

```typescript
export const dataProvider: DatagridDXDataProvider = {
  getList: notImplemented,
  getOne: notImplemented,
  // ... other unused CRUD methods reject with "Not implemented in this read-only remote example."

  async getGrid<RecordType extends RaRecord = RaRecord>(
    resource: string,
    params: GetGridParams
  ): Promise<GetGridResult<RecordType>> {
    if (resource !== 'remote-customers') {
      throw new Error(`Unsupported resource: ${resource}`);
    }

    const apiUrl = import.meta.env.VITE_GRID_API_URL ?? 'http://127.0.0.1:8000';
    const normalizedFilter = normalizeDateOnlyFilter(
      params.loadOptions.filter as unknown[] | null | undefined
    );

    const payload = {
      loadOptions: {
        ...params.loadOptions,
        ...(normalizedFilter !== undefined ? { filter: normalizedFilter } : {}),
      },
    };

    const response = await fetch(`${apiUrl}/api/customers/grid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let errorMessage = `HTTP error ${response.status}`;
      try {
        const errorBody = await response.json();
        if (Array.isArray(errorBody.detail) && errorBody.detail[0]?.msg) {
          errorMessage = errorBody.detail[0].msg;
        }
      } catch {}
      throw new Error(errorMessage);
    }

    const result = await response.json();
    notifyGridSuccess();
    return { data: result.data, totalCount: result.totalCount };
  },
};
```

## Date normalization

Date normalization occurs strictly in the application transport boundary inside `dataProvider.ts` using `normalizeDateOnlyFilter()` from `examples/remote-fastapi/dateOnlyFilter.ts`. The generic `ra-devextreme-grid` library in `src/` remains completely field-agnostic and does not perform data-type coercion.

When a user selects a date (e.g. `2021-04-23`), DevExtreme emits native `Date` objects. `normalizeDateOnlyFilter()` non-mutatingly extracts the local date components (`getFullYear()`, `getMonth()`, `getDate()`) and produces `YYYY-MM-DD` strings before `JSON.stringify()`.

Captured date request payload:

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 10,
    "requireTotalCount": true,
    "filter": [["joined_on", ">=", "2021-04-23"], "and", ["joined_on", "<", "2021-04-24"]]
  }
}
```

## CORS

The FastAPI backend configures `CORSMiddleware` with explicit origins:

- **Allowed Origins**: `http://127.0.0.1:5174`, `http://localhost:5174`
- **Allowed HTTP Methods**: `POST`, `OPTIONS`
- **Allowed Headers**: `Content-Type`
- **Credentials**: Disabled (`allow_credentials=False`)
- **Wildcard Policy**: Strict prohibition (`*` is not used)

Backend unit tests in `test_api.py` verify preflight `OPTIONS` headers, allowed `POST` requests, rejection of unauthorized origins (`http://evil.com`), absence of wildcards, and preservation of non-CORS test isolation.
Browser tests verify that outgoing browser requests receive `Access-Control-Allow-Origin: http://127.0.0.1:5174`.

## Playwright setup

- **Playwright Version**: `@playwright/test@1.63.0`
- **Browser**: Chromium (headless in CI / headed option available)
- **Timezone**: `Asia/Tokyo` (+9h offset)
- **Locale**: `en-US`
- **Workers**: 1 (conservative sequential execution against deterministic database)
- **Retries**: 0 locally, 1 in CI
- **Configuration (`playwright.config.ts`)**:
  - WebServer 1 (Backend): `uv run --directory examples/remote-fastapi/backend uvicorn app.main:app --host 127.0.0.1 --port 8000`, readiness at `http://127.0.0.1:8000/openapi.json`, `GRID_DATABASE_URL` pointing to disposable SQLite DB.
  - WebServer 2 (Frontend): `pnpm dev:remote-fastapi`, readiness at `http://127.0.0.1:5174`.
  - Global Setup & Teardown: Disposes `e2e_customers.db` and WAL/journal files before and after runs.

## E2E scenarios

All 13 required scenarios implemented and passing:

1. `Initial real HTTP load and paging state`: PASS
2. `Page-size selection persistence (10 -> 5 -> 25) without rollback`: PASS
3. `Paging navigation with correct skip and take`: PASS
4. `String filter row filtering by Country`: PASS
5. `Numeric filter row filtering by Age`: PASS
6. `Boolean filter row filtering by Active status`: PASS
7. `Multi-column sorting with ordered descriptors`: PASS
8. `Combined filtering, multi-sorting, and paging`: PASS
9. `Date filtering in non-UTC timezone (Asia/Tokyo) sends date-only strings`: PASS
10. `Surfaces real backend HTTP 422 errors into accessible alert banner`: PASS
11. `Recovers from error state on subsequent valid query`: PASS
12. `Shows native DevExtreme loading panel during delayed requests`: PASS
13. `Receives proper CORS headers matching frontend origin`: PASS

## Page-size regression

In Phase 5A, controlled `paging` caused page size selection to roll back to the initial default on rerenders. Phase 7B verified that using native `defaultPaging` and selecting page sizes through the pager UI (`10 -> 5 -> 25`) persists across reloads and rerenders without rollback:

- Selecting `5`: Outgoing request `take: 5`, visible rows 5, selector displays `5`.
- Selecting `25`: Outgoing request `take: 25`, visible rows 25, selector displays `25`.

## Paging request evidence

Initial load:

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 10,
    "requireTotalCount": true
  }
}
```

Page 2 navigation:

```json
{
  "loadOptions": {
    "skip": 10,
    "take": 10,
    "requireTotalCount": true
  }
}
```

## Multi-sort evidence

Shift-clicking Company after Country:

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 10,
    "requireTotalCount": true,
    "sort": [
      { "selector": "country", "desc": false },
      { "selector": "company", "desc": false }
    ]
  }
}
```

## Filter evidence

String filter (`country = UK`):

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 10,
    "requireTotalCount": true,
    "filter": ["country", "=", "UK"]
  }
}
```

Numeric filter (`age >= 50`):

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 10,
    "requireTotalCount": true,
    "filter": ["age", ">=", 50]
  }
}
```

_Confirmed: Value is serialized as JSON numeric scalar `50`, not string `"50"`._

Boolean filter (`active = true`):

```json
{
  "loadOptions": {
    "skip": 0,
    "take": 10,
    "requireTotalCount": true,
    "filter": ["active", "=", true]
  }
}
```

_Confirmed: Value is serialized as JSON boolean literal `true`, not string `"true"` or numeric `1`._

## Date E2E evidence

- **Browser Context Timezone**: `Asia/Tokyo` (UTC+9)
- **Selected Calendar Date**: `2021-04-23` (matching seeded Customer 8)
- **DevExtreme Native Expression Shape**: DevExtreme expands date equality into a half-open day range:
  `[[joined_on, '>=', Date('2021-04-23T00:00:00+09:00')], 'and', [joined_on, '<', Date('2021-04-24T00:00:00+09:00')]]`
- **Actual POST JSON Payload**:
  ```json
  {
    "loadOptions": {
      "skip": 0,
      "take": 10,
      "requireTotalCount": true,
      "filter": [["joined_on", ">=", "2021-04-23"], "and", ["joined_on", "<", "2021-04-24"]]
    }
  }
  ```
- **Verification**: Zero ISO timestamps (`T...Z`) crossed the network boundary. The local calendar date was preserved without shifting to the previous day (`2021-04-22`).

## Error E2E evidence

- **Deliberate Invalid Request**: Request intercepted via Playwright route and injected with invalid selector:
  `filter: ["invalid_column", "=", "test"]`
- **FastAPI 422 Response**:
  ```json
  {
    "detail": [
      {
        "msg": "Unknown filter selector: 'invalid_column'",
        "type": "grid_query_error"
      }
    ]
  }
  ```
- **Visible Browser Error**: DevExtreme `onDataErrorOccurred` caught the thrown Error; the frontend rendered:
  `<div role="alert" class="app-error-alert">Unknown filter selector: 'invalid_column'</div>`
- **Successful Recovery**: Route override was cleared and filter changed to `Country = UK`. The grid cleanly recovered, rows rendered, and the alert was removed from the DOM.

## Loading E2E evidence

A route hold-and-release pattern was used during a page-size change request to test native loading indication without artificial sleeps:

1. `size5.click()` was initiated while the outgoing `/api/customers/grid` request was paused by Playwright.
2. DevExtreme's `.dx-loadpanel-content` became visible in the DOM.
3. The request was released to FastAPI; the response arrived.
4. `.dx-loadpanel-content` transitioned to invisible and 5 rows rendered.

## CORS E2E evidence

Response headers captured on `POST http://127.0.0.1:8000/api/customers/grid`:

- `access-control-allow-origin`: `http://127.0.0.1:5174`
- `access-control-allow-methods`: `POST, OPTIONS`
- `access-control-allow-headers`: `content-type`

## Backend changes

Backend modifications were strictly limited to:

1. `app/database.py`: Added `GRID_DATABASE_URL` environment override check in `get_database_url()`, allowing temporary SQLite paths for E2E isolation.
2. `app/main.py`: Updated `create_app` signature to accept `cors_origins: Sequence[str] = ()` and attach `CORSMiddleware` when origins are supplied. Defined `LOCAL_DEVELOPMENT_ORIGINS` for the development app instance.
3. `tests/test_api.py`: Added 4 tests validating CORS allowed origins, preflight `OPTIONS`, disallowed origin omission, wildcard prohibition, and `GRID_DATABASE_URL` environment override.

_Phase 7 query compiler semantics (`filtering.py`, `fields.py`, `query.py`) were not modified._

## Tests

- **Frontend Unit Tests**: 369 passed (15 test files)
- **Python Backend Tests**: 1,519 passed (1,515 baseline + 4 new CORS/isolation tests)
- **Browser Playwright E2E Tests**: 13 passed (Chromium, Tokyo timezone)

## CI

A dedicated `e2e` job was added to `.github/workflows/ci.yml`:

- Installs Node 22, pnpm, Python with UV, and Playwright Chromium (`pnpm exec playwright install --with-deps chromium`).
- Syncs backend dependencies (`uv sync --locked`).
- Executes `pnpm test:e2e`.
- Uploads failure artifacts (`test-results/`, `playwright-report/`) retained for 7 days.

## Verification

Outcomes for every required command:

- `pnpm install --frozen-lockfile`: Succeeded (0 exit code)
- `pnpm lint`: Succeeded (0 warnings, 0 errors)
- `pnpm format:check`: Succeeded (all files formatted)
- `pnpm typecheck`: Succeeded (0 type errors)
- `pnpm test`: Succeeded (369/369 tests passed)
- `pnpm build`: Succeeded (dist/ generated)
- `pnpm build:example`: Succeeded (dist-example/ generated)
- `pnpm build:remote-fastapi`: Succeeded (dist-remote-fastapi/ generated)
- `pnpm test:e2e`: Succeeded (13/13 tests passed in 18s)
- `pnpm pack --json`: Succeeded (only dist/, README.md, LICENSE, package.json in tarball)
- `uv sync --locked --directory examples/remote-fastapi/backend`: Succeeded
- `uv run --directory examples/remote-fastapi/backend ruff check .`: Succeeded (All checks passed)
- `uv run --directory examples/remote-fastapi/backend ruff format --check .`: Succeeded (15 files already formatted)
- `uv run --directory examples/remote-fastapi/backend pytest`: Succeeded (1,519 passed in 2.62s)

## Browser warnings

DevExtreme outputs two standard console warnings in unlicensed/evaluation mode:

- `W0019`: "DevExtreme React components are distributed for evaluation purposes only..."
- `W0021`: "DevExtreme license verification failed..."

The Playwright test helper (`attachPageErrorListeners`) specifically permits these known DevExtreme evaluation warnings while failing the suite on any unhandled page errors or application-level exceptions.

## Package inspection

`pnpm pack --json` was verified:

```json
[
  "dist/DatagridDX.d.ts",
  "dist/DatagridDXPagination.d.ts",
  "dist/DatagridDXRemote.d.ts",
  "dist/filterUtils.d.ts",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/index.js.map",
  "dist/remote/createGridStore.d.ts",
  "dist/remote/loadOptions.d.ts",
  "dist/remote/types.d.ts",
  "dist/selectionUtils.d.ts",
  "dist/sortUtils.d.ts",
  "dist/types.d.ts",
  "dist/useManagedFiltering.d.ts",
  "LICENSE",
  "package.json",
  "README.md"
]
```

No backend files, E2E tests, browser configs, example frontends, or database files are included in the package.

## Deviations

None. All deliverables, configurations, and test scenarios match the approved Phase 7B specification and plan.

## Known limitations

- **Chromium-only E2E**: WebKit and Firefox browser testing are deferred to release hardening.
- **No Authentication / Authorization**: The reference example backend provides read-only query functionality without credentials or tokens.
- **No Advanced Grid UI Panels**: Header Filter, Search Panel, and Filter Builder UI are not configured.
- **No Remote Grouping or Summaries**: Grouping, group summaries, and total summaries are deferred to Phase 8.
- **No CRUD / Inline Editing**: Remote operations remain read-only.
- **SQL NULL Semantics**: As documented in Phase 7, SQLite inequality on nullable fields (`age <> 30`) excludes NULL records in accordance with SQL three-valued logic.

## Risks or concerns

None at this stage. The browser, DataProvider, date transport, and FastAPI compiler layers operate reliably and deterministically across all tested scenarios.

## Playwright hardening recommendation

Cross-browser testing (Firefox and WebKit) should be introduced during release hardening rather than intermediate feature phases. Chromium E2E execution provides high confidence for network contracts and component rendering while keeping CI runtime and operational maintenance modest.

## Phase 8 readiness

The browser-to-FastAPI integration is completely verified and ready for:
**Phase 8 — Advanced Remote Operations: Grouping and Summaries**
