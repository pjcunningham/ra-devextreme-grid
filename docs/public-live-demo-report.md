# Public live demo report

## Implementation summary

`examples/remote-fastapi` is now the deployable source for a same-origin public demo as well as the existing clone-and-run reference application. The work adds production-aware API configuration, compact public-demo context and links, an observer-only request inspector, a health endpoint, sanitized Nginx/systemd examples, a manual artifact workflow, production-build verification, and a production-equivalent browser smoke test. `examples/basic` remains unchanged.

## Repository architecture

```text
.github/workflows/demo-build.yml
.junie/plans/016-public-live-demo.md
examples/remote-fastapi/
├── frontend/
│   └── src/
│       ├── DemoIntro.tsx
│       ├── demo.css
│       ├── dataProvider.ts
│       └── existing flat/grouped/group-paged pages
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── database.py
│   │   └── existing grid/query/seed modules
│   ├── pyproject.toml
│   └── uv.lock
└── deploy/
    ├── README.md
    ├── nginx.example.conf
    └── ra-devextreme-grid-demo.service.example
playwright.production.config.ts
scripts/verify-demo-build.mjs
tests/e2e/
├── production-demo.spec.ts
├── production-server.mjs
└── run-production.mjs
```

No duplicate or private application was created.

## Production architecture

```text
Nginx (HTTPS)
├── /                 → static Vite production build
├── /api              → FastAPI/Uvicorn → SQLite
├── /docs             → FastAPI/Uvicorn
└── /openapi.json     → FastAPI/Uvicorn
```

Uvicorn binds to `127.0.0.1`; it is not exposed directly to the Internet.

## Frontend API configuration

`VITE_GRID_API_URL` is an optional API-base override. With no override, Vite development uses `http://127.0.0.1:8000/api` and production uses `/api`. The DataProvider appends `/customers/grid` once. The ordinary production bundle therefore requests same-origin `/api/customers/grid` and contains no `http://127.0.0.1:8000` dependency.

`pnpm build:remote-fastapi` writes the deployable frontend to `dist-remote-fastapi/`. The Vite development server remains part of local development only.

## Demo UX

All three existing pages retain their flat, complete-tree grouped, and remote group-paged grids. A compact introduction identifies a real `DatagridDXRemote` backed by FastAPI, SQLModel, SQLAlchemy, and SQLite. It visibly says **All demo data is synthetic.** Links point to the repository, public example source, npm package, and GitHub Sponsors.

The optional request inspector was straightforward at the example DataProvider boundary, so it was implemented without a library API change. It is collapsed by default and pretty-prints only the latest normalized browser `loadOptions` already sent to `getGrid()`. It contains no headers, credentials, response data, or server details and does not alter grid requests.

## Backend production configuration

The documented production-like command is:

```sh
GRID_DATABASE_URL=sqlite:////var/lib/ra-devextreme-grid-demo/demo.db \
uv run --directory examples/remote-fastapi/backend --locked \
    uvicorn app.main:app --host 127.0.0.1 --port 8001
```

The existing `GRID_DATABASE_URL` mechanism remains the single database configuration. Startup creates missing schema and seeds an empty database. `GET /api/health` returns only `{"status":"ok"}`. `/docs` and `/openapi.json` remain enabled. No debug configuration or new logging framework was added.

## Synthetic data

The existing seed produces the same 100 synthetic records deterministically and `seed_customers_if_empty` remains idempotent. The only data route is `POST /api/customers/grid`; it performs reads. There are no create, update, delete, admin, or authentication routes. Public visitor state is not stored server-side. Existing React-Admin Store layout preferences may remain in browser storage.

## CORS

Development still allows only `http://127.0.0.1:5174` and `http://localhost:5174`, POST/OPTIONS, and `Content-Type`, without credentials or wildcards. Production uses one HTTPS origin through Nginx, so it requires no production CORS expansion.

## Nginx

The sanitized example:

- serves the static frontend with `try_files $uri $uri/ /index.html`;
- proxies `/api/`, `/docs`, and `/openapi.json` to localhost Uvicorn;
- uses `proxy_pass http://127.0.0.1:8001` without a URI suffix, preserving `/api/customers/grid` exactly;
- limits API request bodies to 256 KiB before JSON parsing;
- uses a 3-second connect timeout and 15-second send/read timeouts;
- limits each IP to 10 requests/second with burst 30 and `nodelay`.

The rate is a starting point that operators should tune from observed traffic. Nginx was not installed in the local Windows environment, so `nginx -t` could not be run. Route behavior was reviewed and exercised through the equivalent Node production proxy test; the installed, server-adapted file must still pass `nginx -t`.

## systemd

The generic unit runs one locked Uvicorn process as a placeholder unprivileged user, restarts on failure, and uses `NoNewPrivileges`, `PrivateTmp`, `PrivateDevices`, `ProtectSystem=strict`, and `ProtectHome`. `ReadWritePaths` permits writes only to the example database directory. Operators must adapt users and paths and ensure system-installed UV is available.

The deployment guide recommends separate `/opt` backend, `/var/www` frontend, and `/var/lib` database directories. Its reset procedure stops the service, removes only the configured demo database and SQLite sidecars, then starts the service so normal startup reseeds it. It does not delete the database on routine restart.

## DevExpress licence handling

A valid DevExpress licence is required for the intended public build/deployment. The private build credential is supplied from a secure environment or the GitHub `DEVEXPRESS_LICENSE` secret and exposed to DevExpress tooling as `DevExpress_License`. Documentation contains only `${DEVEXPRESS_LICENSE}` and secret references; no value is committed. Any generated browser-visible licence metadata may be deployed only according to DevExpress tooling and licence terms. The npm peer-dependency and licensing model is unchanged.

## Deployment artifacts and workflow

`.github/workflows/demo-build.yml` is manual `workflow_dispatch` only. It installs locked dependencies, runs representative frontend/backend checks, requires the DevExpress licence secret, builds and verifies the production frontend, runs the same-origin browser test, and uploads:

```text
demo-artifact/
├── frontend/         # dist-remote-fastapi contents
└── backend/
    ├── app/
    ├── pyproject.toml
    ├── uv.lock
    └── .python-version
```

It includes no `.venv`, SQLite database, tests, secrets, SSH action, server address, or restart command. Dependencies are rebuilt on the VPS with `uv sync --locked`.

## Secrets and security review

The modified-file scan searched for `password`, `secret`, `token`, `license`, `licence`, `private key`, `BEGIN OPENSSH`, `BEGIN RSA`, and `DevExpress_License`. Matches were documentation/CI placeholders, existing hostile-selector regression values such as `password_hash` and `secret`, package licence metadata, and historical reports. No credential value, private key, SSH material, real VPS credential, `.env`, or real-data database was found or added.

The final review also confirms:

- no DevExpress private licence value;
- no real server IP, username, private filesystem detail, or SSH key;
- deterministic synthetic data only and no write API;
- Nginx body-size and rate-limit guidance;
- localhost-only Uvicorn and HTTPS guidance;
- narrow development CORS and no wildcard origin;
- no FastAPI debug mode;
- unchanged strict Pydantic, field, filter, summary, grouping, paging, and complexity validation;
- no analytics, telemetry, tracking pixel, cookie, account, or server-side layout persistence.

Ordinary Uvicorn/FastAPI and Nginx logs are retained according to operator policy. Complete request bodies are not intentionally logged.

## Tests

| Suite                             |             Final result |
| --------------------------------- | -----------------------: |
| Vitest                            |               996 passed |
| Pytest                            | 2,301 passed, 6 warnings |
| Playwright regression             |                35 passed |
| Playwright production same-origin |                 1 passed |
| Playwright total                  |                36 passed |

The production test builds the real Vite output, serves static files with SPA fallback, proxies API/docs paths unchanged to FastAPI, and asserts the browser requests `http://127.0.0.1:4174/api/customers/grid`. It also checks 10 rendered rows, `/api/health`, project/source/npm/Sponsors link targets, and SPA fallback. This proves the intended routing boundary without adding Nginx as a test dependency.

The first full Playwright attempt had two timing-only failures in existing error-recovery and native-layout cases; both passed immediately in isolated reruns, and the final fresh full run passed 35/35 without retries. No test was disabled or weakened.

## Verification

| Command                                                                    | Outcome                                                                           |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                           | Passed; lockfile already current                                                  |
| `pnpm lint`                                                                | Passed                                                                            |
| `pnpm format:check`                                                        | Passed                                                                            |
| `pnpm typecheck`                                                           | Passed                                                                            |
| `pnpm test`                                                                | Passed; 996 tests                                                                 |
| `pnpm build`                                                               | Passed                                                                            |
| `pnpm build:example`                                                       | Passed                                                                            |
| `pnpm build:remote-fastapi`                                                | Passed                                                                            |
| `pnpm test:e2e`                                                            | Final fresh run passed; 35 tests                                                  |
| `pnpm test:e2e:production`                                                 | Passed; build inspection and 1 same-origin test                                   |
| `pnpm pack --json`                                                         | Passed; 22 expected files, version 0.1.0                                          |
| `uv sync --locked --directory examples/remote-fastapi/backend`             | Passed; 27 packages resolved, 26 audited                                          |
| `uv run --directory examples/remote-fastapi/backend ruff check .`          | Passed                                                                            |
| `uv run --directory examples/remote-fastapi/backend ruff format --check .` | Passed; 27 files formatted                                                        |
| `uv run --directory examples/remote-fastapi/backend pytest`                | Passed; 2,301 tests                                                               |
| `node scripts/verify-demo-build.mjs`                                       | Passed; `/api` present and localhost:8000 absent                                  |
| `git diff --check`                                                         | Passed                                                                            |
| `git status`                                                               | Reviewed; intended task files plus pre-existing untracked `.idea/jsonSchemas.xml` |
| `git diff`                                                                 | Reviewed                                                                          |
| `nginx -t`                                                                 | Not run; Nginx is not installed locally                                           |

Builds retain the established third-party `use client` and large-chunk warnings. Tests retain expected DevExtreme evaluation/licence output and six backend dependency/intentional-model warnings.

## Package impact

No file under `src/` changed, the package remains version 0.1.0, and the package tarball inventory remains the same 22 files. No npm patch release is required for these demo/deployment changes.

## Known limitations

- The demo is read-only and contains synthetic data only.
- SQLite is a reference backend for a small public demonstration.
- There is no authentication and no production SLA.
- Nginx/systemd examples require server-specific user, path, TLS, DNS, and operational adaptation.
- A valid DevExpress licence and secure build credential are required for frontend build/deployment.
- Rate limits and timeouts are generic starting points.
- Browser automation covers Chromium; Nginx syntax still needs validation on the target server.

## VPS deployment checklist

1. Review this report, the deployment guide, and sanitized configuration examples.
2. Choose DNS and HTTPS handling; obtain the certificate outside this repository.
3. Create an unprivileged service account plus `/opt`, `/var/www`, and writable `/var/lib` directories.
4. Supply the DevExpress licence from a secret manager and run the manual artifact workflow or build locally.
5. Inspect and copy the frontend/backend artifact; run `uv sync --locked` on the server.
6. Adapt and install the systemd unit; start it on localhost and verify `/api/health` directly.
7. Adapt the Nginx hostname, TLS, roots, limits, and upstream; run `nginx -t` before reload.
8. Verify HTTPS, `/`, `/api/customers/grid`, `/api/health`, `/docs`, `/openapi.json`, static assets, SPA fallback, demo links, and advanced grid interactions.
9. Confirm logs, file permissions, database location, rate-limit behavior, and rollback copies.
10. Add the public URL to repository/Borsuk documentation separately after deployment succeeds.

## Recommended next step

The repository is ready for reviewed manual deployment to the developer's existing VPS. The next step is to adapt the placeholder server settings, supply the DevExpress licence securely, run `nginx -t`, and follow the manual checklist. No deployment was performed.
