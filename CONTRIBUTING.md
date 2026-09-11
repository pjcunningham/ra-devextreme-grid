# Contributing to ra-devextreme-grid

Thank you for your interest in contributing to `ra-devextreme-grid`.

---

## Prerequisites

- **Node.js**: `v22` or later (`node --version`)
- **pnpm**: `v10.20.0` or later (`pnpm --version`)
- **Python**: `3.13` or later (for reference backend development and E2E tests)
- **uv**: `0.5` or later (`uv --version`)

---

## Repository Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/pjcunningham/ra-devextreme-grid.git
   cd ra-devextreme-grid
   ```

2. Install frontend dependencies with locked pnpm versions:

   ```bash
   pnpm install --frozen-lockfile
   ```

3. Setup Python backend environment (for the FastAPI reference example):
   ```bash
   uv sync --locked --directory examples/remote-fastapi/backend
   ```

---

## Development Workflow & Commands

### Frontend Build & Test

- **Build library**: `pnpm build` (runs Vite library build and generates `.d.ts` declaration files)
- **Run unit & integration tests**: `pnpm test` (executes Vitest in jsdom environment)
- **Type check**: `pnpm typecheck` (`tsc --noEmit`)
- **Lint**: `pnpm lint` (ESLint)
- **Check formatting**: `pnpm format:check` (Prettier)
- **Format code**: `pnpm format` (Prettier write)
- **Run isolated package smoke test**: `pnpm test:package` (builds tarball, installs in temp consumer under React 18 & 19, and builds)

### Interactive Examples

- **Basic managed example**: `pnpm dev` (runs `examples/basic` on local Vite server)
- **FastAPI remote frontend**: `pnpm dev:remote-fastapi` (starts remote frontend on port 5174)
- **FastAPI backend**:
  ```bash
  uv run --directory examples/remote-fastapi/backend uvicorn app.main:app --host 127.0.0.1 --port 8000
  ```

### Backend Lint & Tests

```bash
# Ruff linter
uv run --directory examples/remote-fastapi/backend ruff check .

# Ruff formatter check
uv run --directory examples/remote-fastapi/backend ruff format --check .

# Pytest backend suite (2,300 tests)
uv run --directory examples/remote-fastapi/backend pytest
```

### End-to-End Browser Tests (Playwright)

E2E tests spin up an ephemeral SQLite database and both the backend (port 8000) and frontend (port 5174):

```bash
# Ensure ports 8000 and 5174 are free before running
pnpm test:e2e

# Or headed mode:
pnpm test:e2e:headed
```

---

## Scope Discipline & Code Guidelines

1. **Feature Freeze**: Changes must adhere to the deliberate Phase 9A feature boundary. New product features (such as inline editing or remote selection) are deferred.
2. **Zero Runtime Dependencies**: The package maintains `"dependencies": {}`. Do not add runtime dependencies without maintainer approval.
3. **Public API Integrity**: Keep internal utilities and hooks strictly encapsulated. Any change to `src/index.ts` must update `tests/index.test.ts`.
4. **Cross-Platform Compatibility**: Scripts and paths must work on both Windows and Linux without shell-specific assumptions.

---

## Pull Request Guidelines

Before submitting a pull request:

1. Ensure all verification checks pass:
   ```bash
   pnpm lint
   pnpm format:check
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm test:package
   uv run --directory examples/remote-fastapi/backend ruff check .
   uv run --directory examples/remote-fastapi/backend pytest
   ```
2. Verify that `git diff --check` emits no whitespace warnings.
3. Provide a clear description of the change, test coverage added, and any relevant issue numbers.
