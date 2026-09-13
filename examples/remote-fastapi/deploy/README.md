# Public demo deployment

This guide deploys the existing read-only FastAPI reference application as a same-origin public demo. Replace every example hostname, user, and path for your server. A hostname such as `ra-devextreme-grid-demo.borsuk.co.uk` may be chosen by the operator, but no real host details are required by the repository.

## Prerequisites and layout

Install Node.js 22, pnpm 10.20, Python 3.13, UV, Nginx, and a supported method of obtaining TLS certificates. A simple layout is:

```text
/opt/ra-devextreme-grid-demo/
    backend/
/var/www/ra-devextreme-grid-demo/
    frontend/
/var/lib/ra-devextreme-grid-demo/
    demo.db
```

Run the API as an unprivileged service account that can read `/opt/.../backend` and write only its `/var/lib/...` database directory. Nginx reads the static frontend. Do not copy `.env`, a development database, `.venv`, test output, or repository credentials.

## Build the frontend

DevExtreme is commercial software. Supply the private DevExpress build licence through the secure environment or CI secret expected by DevExpress tooling. For example, source `${DEVEXPRESS_LICENSE}` from your secret manager and expose it to the build as `DevExpress_License`; never store its value in Git, an example file, shell history, or the deployment artifact.

```sh
pnpm install --frozen-lockfile
DevExpress_License="${DEVEXPRESS_LICENSE}" pnpm build:remote-fastapi
```

The output is `dist-remote-fastapi/`. Copy its contents to `/var/www/ra-devextreme-grid-demo/frontend/`. The normal production build needs no API environment variable and uses same-origin `/api`. `VITE_GRID_API_URL` remains an optional compile-time override for unusual deployments.

Generated browser-visible licence metadata may be present only as allowed by DevExpress's build tooling and licence terms. The private build credential remains secret regardless of what the tooling emits.

## Install and run the backend

Copy `examples/remote-fastapi/backend/app/`, `pyproject.toml`, `uv.lock`, and `.python-version` to `/opt/ra-devextreme-grid-demo/backend/`, then install locked dependencies on the server:

```sh
uv sync --locked --directory /opt/ra-devextreme-grid-demo/backend
```

Create the writable database directory and assign it to the service account. The generic runtime command is:

```sh
GRID_DATABASE_URL=sqlite:////var/lib/ra-devextreme-grid-demo/demo.db \
uv run --directory /opt/ra-devextreme-grid-demo/backend --locked \
    uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Keep Uvicorn on localhost behind Nginx. One process is sufficient for this small SQLite demo. Startup creates the schema and idempotently seeds the existing deterministic 100-record synthetic dataset when the database is empty. The API exposes no create, update, or delete route.

Install the example systemd unit as a starting point, adapt its placeholder user and paths, then run `systemctl daemon-reload`, enable, and start it. `ProtectSystem=strict` and `ReadWritePaths` leave only the demo data directory writable. Keep `/docs`, `/openapi.json`, and `/api/health` proxied for developer documentation and monitoring. Do not enable FastAPI debug mode.

## Configure Nginx and HTTPS

Adapt `nginx.example.conf` inside the Nginx `http` context. The `/api/` location deliberately uses:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8001;
}
```

Because `proxy_pass` has no URI and no trailing slash, Nginx forwards `/api/customers/grid` unchanged. Adding a slash after the upstream would strip `/api/` and break the backend route.

The example serves the Vite files with an SPA fallback, passes ordinary proxy headers, limits request bodies to 256 KiB, and uses 3-second connect plus 15-second send/read timeouts. The body limit is comfortably above normal grid JSON while stopping unbounded bodies before FastAPI parses them. The timeouts suit an interactive demo and avoid tying up connections for unusually slow requests.

The per-IP zone allows 10 requests per second with a burst of 30, which accommodates rapid filtering and group expansion while limiting simple abuse. Tune it from observed legitimate traffic and server capacity. This is coarse demo protection rather than an application quota.

Run `nginx -t` after installing the adapted configuration. Terminate TLS with existing Nginx/Certbot infrastructure or another trusted HTTPS layer. Certificate issuance and DNS changes are server operations outside this repository.

Production requests are same-origin, so no production CORS setting is needed. The application retains only its narrow localhost CORS policy for the separate Vite development server.

## Verify

After startup, check:

```sh
curl --fail https://demo.example.com/api/health
curl --fail https://demo.example.com/openapi.json
curl --fail -X POST https://demo.example.com/api/customers/grid \
    -H 'Content-Type: application/json' \
    --data '{"loadOptions":{"skip":0,"take":1,"requireTotalCount":true}}'
```

The health response is `{"status":"ok"}` and the grid response reports `totalCount: 100`. Open the site and confirm paging, filtering, grouping, summaries, the request inspector, project links, and SPA route reloads. Inspect the browser network panel to confirm `/api/customers/grid` uses the page origin. `/docs` is useful public developer documentation; hiding it is not a security boundary.

Use ordinary Uvicorn/FastAPI and Nginx access/error logs. Retain or rotate them under the server operator's normal policy. The application does not intentionally log complete request bodies.

## Reset the deterministic database

The read-only API should not drift. If a reset is required, stop the service and remove only this configured SQLite database and its sidecars, then start the service so startup reseeds it:

```sh
sudo systemctl stop ra-devextreme-grid-demo
sudo rm -f -- /var/lib/ra-devextreme-grid-demo/demo.db \
    /var/lib/ra-devextreme-grid-demo/demo.db-shm \
    /var/lib/ra-devextreme-grid-demo/demo.db-wal
sudo systemctl start ra-devextreme-grid-demo
```

Confirm the resolved path and service are the demo instance before running the reset. Do not delete the database on each service restart.

## Update, rollback, and artifacts

The manual GitHub Actions workflow packages `demo-artifact/frontend` and `demo-artifact/backend` without a database, virtual environment, tests, or secrets. Download and inspect it, back up the currently deployed frontend/backend directories, stop the API, install the new locked backend dependencies, replace the static files and backend source, start the API, and run the verification checks. Reload Nginx only when its configuration changed.

To roll back, restore the previous frontend/backend files, run `uv sync --locked` for that backend lockfile, and restart the service. The schema is currently simple and seeded read-only; review future schema changes before reusing a newer database with older code.
