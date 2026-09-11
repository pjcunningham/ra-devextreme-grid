# Manual Release Procedure (0.1.0)

This document describes the manual release procedure for publishing `ra-devextreme-grid` to npm.

Publishing is intentionally manual for the `0.1.0` release to ensure full developer review and verification before establishing automated CI release pipelines.

---

## Pre-Release Checklist

1. **Verify Clean Working Tree**:
   Ensure you are on the `main` branch with no uncommitted changes:

   ```bash
   git checkout main
   git pull origin main
   git status
   ```

2. **Verify Version & Changelog**:
   - `package.json` specifies `"version": "0.1.0"`.
   - `CHANGELOG.md` contains the release notes under `## [0.1.0]`.

3. **Install Locked Dependencies**:

   ```bash
   pnpm install --frozen-lockfile
   uv sync --locked --directory examples/remote-fastapi/backend
   ```

4. **Run Full Verification Suite**:
   Execute all test and quality gates:

   ```bash
   pnpm lint
   pnpm format:check
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm build:example
   pnpm build:remote-fastapi
   uv run --directory examples/remote-fastapi/backend ruff check .
   uv run --directory examples/remote-fastapi/backend ruff format --check .
   uv run --directory examples/remote-fastapi/backend pytest
   pnpm test:e2e
   ```

5. **Execute Package Smoke Verification**:
   Verify that the package builds, packs, installs, and compiles in an isolated consumer under React 19 and React 18:

   ```bash
   pnpm test:package
   ```

6. **Inspect Package Tarball Contents**:
   Verify that only `dist/`, `package.json`, `README.md`, and `LICENSE` are included:

   ```bash
   npm pack --dry-run --json
   ```

7. **Verify Npm Package Name Availability**:
   ```bash
   pnpm view ra-devextreme-grid
   ```
   Confirm the registry returns 404 (package name available to register) or shows your own unpublished reservation.

---

## Publishing Steps

8. **Authenticate with npm**:
   Ensure your local npm credentials and 2FA are configured:

   ```bash
   pnpm login
   pnpm whoami
   ```

9. **Run Publication Dry Run**:
   Verify the dry-run output matches expectations without uploading anything:

   ```bash
   pnpm publish --dry-run --access public --no-git-checks
   ```

10. **Publish to npm**:
    Execute the publication command:

    ```bash
    pnpm publish --access public --no-git-checks
    ```

11. **Verify Published Package**:
    Verify the package is live on npm and installs cleanly:
    ```bash
    pnpm view ra-devextreme-grid@0.1.0
    ```

---

## Post-Release Steps

12. **Create Git Tag**:

    ```bash
    git tag -a v0.1.0 -m "Release v0.1.0"
    git push origin v0.1.0
    ```

13. **Create GitHub Release**:
    - Go to: [https://github.com/pjcunningham/ra-devextreme-grid/releases/new](https://github.com/pjcunningham/ra-devextreme-grid/releases/new)
    - Select tag: `v0.1.0`
    - Release title: `ra-devextreme-grid v0.1.0`
    - Copy the notes from `CHANGELOG.md` under `## [0.1.0]`.
    - Publish release.
