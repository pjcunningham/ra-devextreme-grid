# Public Live Demo

## Objective

Make `examples/remote-fastapi` both the clone-and-run reference implementation and the source of a public, read-only live demo. Preserve `examples/basic` and the published `ra-devextreme-grid@0.1.0` package.

## Current structure

- `frontend/` is a Vite/React-Admin application with flat, complete-tree grouped, and lazy group-paged `DatagridDXRemote` pages.
- `backend/` is a UV-managed FastAPI/SQLModel/SQLAlchemy application with one read-only grid endpoint, strict request/query validation, deterministic SQLite seeding, narrow development CORS, and `GRID_DATABASE_URL` support.
- Playwright starts the backend and Vite development server on separate localhost origins and verifies the complete feature set.

## Production architecture and frontend API URL

Nginx terminates HTTPS, serves the Vite production build at `/`, and proxies `/api/...` unchanged to a localhost-only Uvicorn process backed by SQLite. The frontend data provider uses `VITE_GRID_API_URL` when supplied and otherwise chooses `http://127.0.0.1:8000` in Vite development and `/api` in production. The endpoint suffix is joined once, so production requests are `/api/customers/grid`; no public hostname is compiled into source and the normal production build needs no environment variable.

## Frontend build and demo UX

`pnpm build:remote-fastapi` remains the production build command and writes `dist-remote-fastapi/` for copying to the Nginx web root. Add a compact shared introduction that identifies the live demo, states that all data is synthetic, and links to GitHub, the example source, npm, and Sponsors while keeping each existing grid page and capability intact. Add a secondary, collapsible request inspector at the DataProvider boundary if it remains a small observer-only change; it will display only the latest browser-generated load options.

## Backend runtime, database, and synthetic data

Run one Uvicorn process from `backend/`, bound to `127.0.0.1` behind Nginx. Continue using `GRID_DATABASE_URL`; document a writable absolute SQLite URL such as `sqlite:////var/lib/ra-devextreme-grid-demo/demo.db`. Startup creates the schema and seeds only an empty database with the existing deterministic 100-record synthetic dataset. No mutation endpoints, authentication, admin UI, automatic restart-time deletion, or new database framework will be added. Provide a narrowly targeted reset procedure that stops the service, removes only the configured demo DB, and lets startup reseed it. Add a cheap `/api/health` response for deployment verification without exposing internals.

## Development and CORS

Keep the existing two-server workflow and ports. Development requests continue to target `http://127.0.0.1:8000`; the backend continues to allow only `http://127.0.0.1:5174` and `http://localhost:5174`, POST/OPTIONS, and `Content-Type`. Production is same-origin and needs no additional or wildcard CORS policy.

## Nginx and systemd examples

Add sanitized examples under `examples/remote-fastapi/deploy/`. Nginx will include SPA fallback, an exact route-preserving `/api/` proxy using `proxy_pass http://127.0.0.1:8001` without a URI suffix, a 256 KiB request-body limit, short interactive proxy timeouts, ordinary forwarded headers, and a per-IP `limit_req_zone` with a burst suitable for rapid filtering/group expansion. Operators can tune the rate. The systemd example uses placeholder user/paths, `uv run --locked uvicorn app.main:app`, localhost binding, restart-on-failure, `NoNewPrivileges`, `PrivateTmp`, and filesystem protections that leave the configured `/var/lib/...` database directory writable.

## Security, licensing, and operations

Keep strict Pydantic/filter/group validation and generic production error handling; do not enable FastAPI debug mode or body logging. Retain `/docs` and `/openapi.json`. Recommend HTTPS, normal Nginx/Uvicorn logs and operator retention policy, localhost-only Uvicorn, body limits, timeouts, and Nginx rate limiting. Commit no credentials, real VPS details, SSH material, `.env`, database, or DevExpress key. Document that a private DevExpress build licence is supplied securely as `${DEVEXPRESS_LICENSE}` during the frontend build and handled according to DevExpress tooling; it never belongs in Git.

## Deployment artifacts and workflow

Add a manual `workflow_dispatch` build/package workflow, with no SSH deployment. It verifies the deployable example, builds the frontend, stages `frontend/` plus only backend runtime files (`app/`, `pyproject.toml`, `uv.lock`, and `.python-version` if present), and uploads an artifact. Python dependencies are recreated on the server with `uv sync --locked`; no virtualenv, SQLite DB, tests, secrets, or development output is packaged.

## Testing and documentation

- Preserve the existing Vitest, approximately 2,300-test Pytest, and 35-test Playwright suites.
- Add focused browser coverage for the intro/links and inspector if included.
- Add a production same-origin harness that serves the built frontend and proxies `/api` to the existing FastAPI process without requiring Nginx; assert browser requests use `/api/customers/grid` on the frontend origin.
- Add build verification that the default production artifact has no dependency on `http://127.0.0.1:8000`, and review the Nginx trailing-slash behavior explicitly.
- Run all requested package, frontend, backend, browser, format, diff, and secret checks; syntax-check Nginx only if it is locally available.
- Update the remote example README, add the generic deploy README, minimally update the root README, and write `docs/public-live-demo-report.md` with exact final results and the manual VPS checklist.

## Scope exclusions

No real deployment, certificate issuance, SSH/SCP/rsync, automatic deployment from `main`, npm version/release/tag change, core library feature, analytics, telemetry, cookies, accounts, authentication, write API, server-side visitor persistence, private duplicate demo, Borsuk repository change, or unsupported grid feature.
