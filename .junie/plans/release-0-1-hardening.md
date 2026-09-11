---
sessionId: session-260911-221124-1d4t
---

# Requirements

### Overview & Goals
The goal of this task is to perform release hardening, packaging validation, documentation overhaul, and publication readiness review for `ra-devextreme-grid`, turning the existing codebase (currently frozen at Phase 9A) into a verified, high-quality **0.1.0 release candidate** ready for npm publication.

The release preserves the deliberate feature freeze at Phase 9A: no Phase 9B query persistence, inline editing, or new product features will be introduced. The focus is strictly on public API stabilization, clean package distribution, peer dependency clarity, isolated consumer verification, comprehensive documentation, and repository hygiene.

### Scope

#### In Scope
- **Version Transition**: Transition the package version from `0.0.0` to `0.1.0` in `package.json` and all documentation.
- **Npm Package-Name Availability**: Confirm and record registry availability for the unscoped name `ra-devextreme-grid`.
- **Public API Audit & Freeze**: Audit all exports from `src/index.ts`, classify every symbol, encapsulate private implementation details, and verify TypeScript declaration quality.
- **Package Entry Points & Bundling**: Validate ESM entry points (`main`, `module`, `types`, `exports`, `files`), bundle externalization (zero bundling of React, React-Admin, DevExtreme, or CSS), and verify npm tarball contents.
- **Peer Dependency Ranges**: Audit declared ranges for DevExtreme (`^26.1.0` vs tested `26.1.4`), React-Admin (`^5.0.0` vs tested `5.15.x`), and React 18/19 compatibility with concrete evidence.
- **Clean Isolated Consumer Verification**: Build and test a completely isolated consumer application outside the project tree that installs the packed `.tgz` tarball and validates both managed and remote grids under strict peer resolution.
- **Documentation Overhaul**: Rewrite `README.md` for end-user developers (value proposition, quick starts, feature comparison matrix, known limitations, disclaimers), and create `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, and `RELEASING.md`.
- **Repository Hygiene**: Add GitHub issue templates (Bug Report, Feature Request) and PR template.
- **Security & Dependency Audit**: Record `pnpm audit` and uv lockfile status, confirming zero runtime dependencies.
- **CI & Portability Review**: Measure CI stage durations, verify Windows/Linux portability, clean checkout bootstrap, and console warnings.
- **Authoritative Release Report**: Deliver `docs/release-0.1-hardening-report.md` with explicit release readiness verdict.

#### Out of Scope (Feature Freeze)
- Phase 9B remote query-state persistence.
- Inline grid editing (Phase 10).
- Remote React-Admin selection and bulk actions.
- Header Filter, Search Panel, and Filter Builder.
- Grouping, summary, or backend query additions.
- React-Admin Field/Input rendering inside DevExtreme cells.
- State-sharing features or saved named views.
- Commercial Pro code, licensing keys, telemetry, or paywalls.
- Automated tag/npm release pipelines in CI (release procedure remains manual for 0.1.0).

### User Stories
- **As an application developer**, I want to install `ra-devextreme-grid` from npm with clear peer dependency requirements so that I can seamlessly integrate DevExtreme DataGrid into my React-Admin application.
- **As a TypeScript consumer**, I want accurate, uncluttered type definitions and autocompletion for managed and remote grid props, data providers, summaries, grouping, and layout persistence without private implementation leaks.
- **As an open-source evaluator**, I want a clear, concise README with quick-start examples, a feature comparison matrix, and known limitations so that I can quickly decide whether this package meets my requirements.
- **As a library maintainer**, I want a reproducible package smoke test and a documented manual release checklist so that releases can be published predictably without packaging defects or broken dependencies.

### Functional Requirements
- **Package Manifest & Version**: `package.json` must declare version `0.1.0`, `type: "module"`, appropriate metadata (description, keywords, repository, bugs, homepage, license), and correct export mappings.
- **Package Externalization**: The bundled artifact (`dist/index.js`) must externalize all peer dependencies: `react`, `react-dom`, `react-admin`, `ra-core`, `devextreme`, `devextreme-react`, and must not bundle DevExtreme CSS, backend code, examples, or tests.
- **Tarball Purity**: The packed `.tgz` archive must contain only package metadata, `README.md`, `LICENSE`, and `dist/` files.
- **Consumer Smoke Testing**: A dedicated smoke verification routine must verify that an isolated application outside the workspace can install the packed `.tgz`, resolve types, and build managed and remote grids with Vite and TypeScript.
- **Documentation**: `README.md` must be rewritten to prioritize user needs over chronological phase logs, with separate managed and remote quick-start examples, feature matrix, theme guide, and limitation disclosures.
- **Community Standards**: The repository must include `CHANGELOG.md` (0.1.0 entry), `CONTRIBUTING.md`, `SECURITY.md`, `RELEASING.md`, and `.github/` templates.

### Non-Functional Requirements
- **Zero Runtime Dependencies**: The package must maintain `"dependencies": {}`, relying entirely on consumer-provided peer dependencies.
- **Type Safety**: Generated `.d.ts` declaration files must compile cleanly with `tsc --noEmit` and retain generic `RaRecord` and ID constraints without falling back to `any`.
- **Platform Portability**: All scripts, examples, and test runners must function consistently on both Windows and Linux environments.
- **Test Baseline**: All 996 Vitest unit tests, 2,300 Pytest backend tests, and 35 Playwright E2E browser tests must pass with zero regressions.

# Technical Design

### Current Implementation
- **Source Architecture**: 17 TypeScript source files located in `src/`, with core components `DatagridDX.tsx`, `DatagridDXPagination.tsx`, and `DatagridDXRemote.tsx`.
- **Build Tooling**: Vite 6 configured in library mode (`vite.config.ts`) outputting single ESM bundle `dist/index.js` with TypeScript declarations generated by `vite-plugin-dts`.
- **Peer Dependencies**: Currently declared in `package.json` as `devextreme: "^26.1.0"`, `devextreme-react: "^26.1.0"`, `react: "^18.0.0 || ^19.0.0"`, `react-admin: "^5.0.0"`, `react-dom: "^18.0.0 || ^19.0.0"`.
- **Examples**: `examples/basic` (managed client-side example) and `examples/remote-fastapi` (full-stack remote example with Python backend and frontend).
- **Test Infrastructure**: Vitest (996 tests), Pytest (2,300 tests), Playwright Chromium E2E (35 tests).

### Key Decisions

#### 1. Version Bump to 0.1.0
- **Decision**: Update `package.json` and documentation from `0.0.0` to `0.1.0`. Do not create git tags or GitHub releases during this task.
- **Rationale**: Signals an early, stable public release candidate suitable for developer evaluation, per SemVer conventions.

#### 2. Public API Inventory and Boundary Freeze
- **Decision**: Freeze the public API to:
  - Components: `DatagridDX`, `DatagridDXPagination`, `DatagridDXRemote`.
  - Filter conversion helpers: `defaultGetRaFilters`, `defaultGetDxFilterValue`, `parseRaFilterKey` (along with exporting `ParsedRaFilterKey` type for consistency).
  - Managed types: `DatagridDXProps`, `DatagridDXPaginationProps`, `DatagridDXSelectionOptions`, `DatagridDXRowClick`, `DatagridDXFilterRowOptions`, `DatagridDXFilterContext`, `DatagridDXGetRaFilters`, `DatagridDXGetDxFilterValue`.
  - Remote types: `DatagridDXRemoteProps`, `DatagridDXRemoteSummaryOptions`, `DatagridDXRemoteSummaryGroupItem`, `DatagridDXRemoteGroupingOptions`, `DatagridDXDataProvider`, `GetGridLoadOptions`, `GetGridParams`, `GetGridResult`, `GetGridSortDescriptor`, `GetGridGroupDescriptor`, `GetGridGroupPagingContext`, `GetGridGroupKey`, `GetGridGroupItem`, `GetGridSummaryType`, `GetGridSummaryDescriptor`, `GetGridSummaryValue`.
  - Internal symbols (`createGridStore`, `useGridLayoutPersistence`, `StoredGridLayoutV1`, `normalizeLoadOptions`, etc.) remain strictly internal.
- **Rationale**: Prevents accidental coupling to internal implementation details while exposing all types necessary for consumer customization.

#### 3. Peer Dependency Ranges vs Tested Baselines
- **Decision**: Distinguish clearly between declared peer ranges and tested baseline versions:
  - DevExtreme: Tested against `26.1.4`. Maintain peer range `^26.1.0` (or conservative `^26.1.4` if patch-level differences pose risk).
  - React-Admin: Tested against `5.15.3`. Declare conservative peer range `^5.0.0` (or `^5.4.0` where modern Store context APIs stabilized).
  - React / React DOM: Declare `^18.2.0 || ^19.0.0` after verifying consumer builds with both versions, or narrow to `^19.0.0` if React 18 cannot be cleanly verified without hacks.
- **Rationale**: Accurately reflects verified integration points without making unsupported compatibility claims.

#### 4. Clean Isolated Consumer Smoke Test
- **Decision**: Implement a cross-platform consumer verification script (`scripts/test-package.mjs` or `pnpm test:package`) that packs the real `.tgz`, unpacks into a temporary directory outside the project root, installs peer dependencies, compiles TypeScript, and runs a production Vite build.
- **Rationale**: Proves that the distributed package works without relying on root monorepo paths, workspace aliases, or development devDependencies.

#### 5. Package Configuration (`sideEffects` and `engines`)
- **Decision**: Do not declare `"sideEffects": false` unless verified that DevExtreme React tree-shaking behaves correctly. Omit restrictive Node `engines` from `package.json` as the library runs in bundlers and browsers.
- **Rationale**: Prevents premature optimization that could strip necessary side-effects in consumer bundlers.

#### 6. Manual Release Procedure
- **Decision**: Create `RELEASING.md` documenting manual publication steps (2FA, dry run, tagging) rather than automating CI publishing in 0.1.0.
- **Rationale**: The initial release requires human developer review and verification before any automated CD pipeline is established.

### Proposed Changes

#### Packaging & Manifest
- `package.json`: Version `0.1.0`, review `peerDependencies`, update `keywords` and metadata, add `test:package` script.
- `src/index.ts`: Export `ParsedRaFilterKey` type from `filterUtils.ts`; ensure no private helpers are exposed.
- `vite.config.ts`: Verify rollup external patterns and source maps.

#### Community & Documentation Files
- `README.md`: Complete rewrite focusing on value proposition, quick-starts, feature comparison table, known limitations, and licensing notices.
- `CHANGELOG.md`: New file detailing 0.1.0 features, architecture, and known limitations.
- `CONTRIBUTING.md`: New file covering local setup, test execution, coding standards, and PR guidelines.
- `SECURITY.md`: New file detailing vulnerability reporting instructions.
- `RELEASING.md`: New file detailing the step-by-step manual release checklist.
- `.github/ISSUE_TEMPLATE/bug_report.yml`: Bug report form with version details.
- `.github/ISSUE_TEMPLATE/feature_request.yml`: Feature request form.
- `.github/PULL_REQUEST_TEMPLATE.md`: Standard pull request checklist.

#### Hardening Plan & Final Report
- `.junie/plans/015-release-0.1-hardening.md`: Comprehensive release hardening plan.
- `docs/release-0.1-hardening-report.md`: Authoritative assessment with release readiness verdict.

### Architecture Diagram

```mermaid
graph TD
    subgraph Source & Build
        SRC[src/index.ts & components] --> VITE[Vite Library Build]
        VITE --> DIST[dist/ output: index.js + .d.ts]
    end

    subgraph Packaging
        DIST --> PACK[npm pack]
        PKG[package.json v0.1.0] --> PACK
        LIC[LICENSE & README.md] --> PACK
        PACK --> TGZ[ra-devextreme-grid-0.1.0.tgz]
    end

    subgraph Consumer Verification
        TGZ --> SMOKE[Isolated Temp Consumer]
        PEERS[Peer Deps: React, RA, DevExtreme] --> SMOKE
        SMOKE --> TSC[TypeScript Typecheck]
        SMOKE --> BUILD[Vite Production Build]
    end

    subgraph Regression & Reporting
        VITEST[Vitest: 996 tests] --> REPORT[docs/release-0.1-hardening-report.md]
        PYTEST[Pytest: 2,300 tests] --> REPORT
        E2E[Playwright: 35 tests] --> REPORT
        SMOKE --> REPORT
```

### Risks and Mitigations
- **Port Collision in E2E**: Running Playwright E2E tests locally requires ports 8000 and 5174 to be free. *Mitigation*: Document pre-requisite port availability in `CONTRIBUTING.md` and check ports before running E2E.
- **React 18 vs 19 Peer Resolution**: React-Admin 5 officially targets React 18/19, but pnpm peer resolution can differ across package managers. *Mitigation*: Test isolated consumer installation with both React 19 and React 18 in the smoke verification script; if React 18 has unresolvable peer conflicts, narrow the peer range explicitly.
- **DevExtreme Evaluation Warnings**: DevExtreme outputs console warnings (W0019/W0021) in non-commercial test runs. *Mitigation*: Document these as expected third-party evaluation notices in the hardening report, distinguishing them from adapter runtime errors.

# Testing

### Validation Approach
Verification consists of multi-layer testing:
1. **Isolated Consumer Smoke Tests**: Testing the packed `.tgz` outside the repository tree to prove clean resolution, TypeScript types, and Vite bundling.
2. **Unit & Integration Regression Suite**: Running the full 996 Vitest suite to ensure all component and utility behaviors remain intact.
3. **Backend API Suite**: Running all 2,300 Pytest tests in the reference FastAPI backend to ensure query and filter behaviors remain unchanged.
4. **Browser E2E Suite**: Running all 35 Playwright tests in Chromium against the live backend to verify complete end-to-end integration.
5. **Clean Checkout Simulation**: Verifying that a clean repository checkout installs and builds with `--frozen-lockfile` and `--locked`.

### Key Scenarios
- **Scenario 1: Package Tarball Inspection**
  - Run `npm pack --dry-run --json` and inspect the generated file list.
  - Assert that only `dist/`, `package.json`, `README.md`, and `LICENSE` are present.
  - Verify that no test files, Python code, examples, or `.junie` folders are included.
- **Scenario 2: Isolated Consumer — Managed Grid**
  - Create a temporary consumer project with its own `package.json` installing the packed `.tgz`.
  - Write a minimal React-Admin application importing `DatagridDX`, `DatagridDXPagination`, and DevExtreme `<Column>`.
  - Typecheck with `tsc --noEmit` and build with Vite production mode.
  - Verify zero type errors and clean bundling.
- **Scenario 3: Isolated Consumer — Remote Grid**
  - Extend the temporary consumer to import `DatagridDXRemote` and `DatagridDXDataProvider`.
  - Implement a mock `getGrid()` call returning paginated, sorted, filtered, and grouped items.
  - Typecheck with `tsc --noEmit` and build with Vite production mode.
  - Verify that remote descriptors and summary types compile cleanly.
- **Scenario 4: Dual React Compatibility Verification**
  - Test consumer installation under React 19 + React-Admin 5.15.
  - Test consumer installation under React 18 + compatible React-Admin 5.
  - Verify whether strict peer dependency installation succeeds in both or requires narrowing.
- **Scenario 5: Complete Test Regression**
  - Run `pnpm test` (assert 996 passed).
  - Run `uv run pytest` in `examples/remote-fastapi/backend` (assert 2,300 passed).
  - Run `pnpm test:e2e` (assert 35 passed).

### Edge Cases
- **Undeclared Dependency Leakage**: An isolated consumer without workspace packages must not fail on runtime imports (e.g. missing lodash or utility libraries).
- **TypeScript Module Resolution**: Declarations must resolve correctly under both `moduleResolution: "bundler"` and `moduleResolution: "node16"`.
- **Date/Timezone Parity**: E2E tests must maintain deterministic execution in `Asia/Tokyo` timezone as configured in Playwright.

### Test Changes
- Add `scripts/test-package.mjs` or `tests/package-smoke/` to execute the automated tarball install, typecheck, and build sequence.
- Add `pnpm test:package` script to `package.json`.
- Update `tests/index.test.ts` to assert that public exports match the audited inventory and that `ParsedRaFilterKey` is exported if retained.

# Delivery Steps

### ✓ Step 1: Public API audit, package metadata, and hardening plan foundation
The package metadata is updated to 0.1.0, the public API is audited and frozen with all internal implementation helpers encapsulated, and `.junie/plans/015-release-0.1-hardening.md` is authored.

- Create `.junie/plans/015-release-0.1-hardening.md` detailing the comprehensive hardening roadmap across all 77 audit points.
- Bump `package.json` version from `0.0.0` to `0.1.0` and update version references in documentation and example package manifests.
- Audit `src/index.ts` exports: classify `DatagridDX`, `DatagridDXPagination`, `DatagridDXRemote`, and associated types as stable public API; verify whether `parseRaFilterKey` should export its companion type `ParsedRaFilterKey` or be internal; verify `defaultGetRaFilters` and `defaultGetDxFilterValue` signatures.
- Refine `package.json` peer dependency ranges: establish conservative, verified ranges for DevExtreme (`^26.1.0` or `^26.1.4`) and React-Admin (`^5.0.0` or verified lower bound `^5.4.0`), documenting tested patch levels separately from declared ranges.
- Evaluate `package.json` metadata fields: update keywords, description, ensure `sideEffects: false` safety analysis is recorded, and confirm absence of restrictive `engines` requirements.
- Update `tests/index.test.ts` to assert public API inventory stability and prevent leakage of internal symbols.

### ✓ Step 2: Package bundling, tarball verification, and isolated consumer smoke testing
The npm release tarball is cleanly built, verified to be free of extraneous assets, and proven to install and compile in an isolated consumer application with zero repository workspace leakage.

- Execute production library build with `vite build` and generate TypeScript declarations with `vite-plugin-dts`.
- Audit production bundle `dist/index.js` to ensure 100% externalization of React, ReactDOM, React-Admin, ra-core, DevExtreme, and DevExtreme React, with zero bundled CSS or proprietary assets.
- Generate real `.tgz` tarball using `npm pack` and inspect tarball contents to confirm inclusion only of `dist/`, `package.json`, `README.md`, and `LICENSE`.
- Implement a reproducible package verification script (`tests/package-smoke/` or `pnpm test:package`) that creates a temporary isolated project outside the source tree, installs the packed `.tgz` plus peer dependencies, and builds without local workspace aliases.
- Test isolated consumer smoke apps: compile managed grid (`DatagridDX`, `DatagridDXPagination`, column chooser, layout persistence) and remote grid (`DatagridDXRemote`, `DatagridDXDataProvider`, sorting, filters, summaries, grouping, and group paging).
- Verify compatibility matrix evidence for React 19 and React 18, confirming or conservatively narrowing the declared peer range.

### ✓ Step 3: Consumer documentation rewrite and repository community standards
The repository documentation is restructured from historical phase notes into a clean, developer-focused guide, and standard open-source community files are added.

- Rewrite `README.md` for end-user developers: start with value proposition, clear differentiation between managed and remote modes, installation guide, theme setup, copyable quick-starts, feature comparison matrix, known limitations, and licensing notices.
- Remove stale development text, obsolete phase numbers, experimental notices, and outdated status statements from `README.md`.
- Add `CHANGELOG.md` summarizing major capabilities of the initial `0.1.0` release across Added, Architecture, Examples, Testing, and Known Limitations sections.
- Add `CONTRIBUTING.md` describing pnpm workflow, Node prerequisites, uv backend commands, test execution guidelines, formatting/linting rules, and PR expectations.
- Add `SECURITY.md` detailing the security reporting process via GitHub Security Advisories or maintainer contact without inventing private credentials.
- Add `RELEASING.md` documenting the step-by-step manual release procedure, pre-publish checks, 2FA requirements, publication commands, and tagging instructions.
- Create GitHub issue templates (`.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml`) and pull request template (`.github/PULL_REQUEST_TEMPLATE.md`).

### ✓ Step 4: Security audit, example verification, and cross-platform portability
All project dependencies, security posture, example applications, and cross-platform portability aspects are thoroughly validated.

- Perform security and dependency audits using `pnpm audit` and `uv` lockfile inspection, documenting the 3 moderate dev/transitive findings and confirming zero runtime dependencies.
- Verify `examples/basic` runs standalone without backend dependencies and showcases core managed grid capabilities.
- Verify `examples/remote-fastapi` clean startup documentation (`uv sync --locked`, `uv run uvicorn ...`) and confirm instructions contain no machine-specific paths or assumptions.
- Audit build scripts, test runners, and E2E harness (`tests/e2e/run.mjs`, `playwright.config.ts`) for Windows/Linux portability, path separator normalization, and environment variable handling.
- Audit console output across Vitest and example runs to document expected DevExtreme evaluation/licensing notices versus real adapter diagnostics.
- Perform accessibility sanity review for keyboard navigation, pager controls, selection checkboxes, and filter row editors.

### ✓ Step 5: Full regression validation, CI timing benchmarks, and publication readiness report
The entire test suite passes without regressions, stage execution times are recorded, and the authoritative release hardening report `docs/release-0.1-hardening-report.md` is delivered.

- Execute the complete test suite: 996 Vitest unit/integration tests, 2,300 backend Pytest tests, and 35 Playwright E2E browser tests in `Asia/Tokyo` timezone.
- Measure and record baseline timings for install, lint/format/typecheck, Vitest, library build, example builds, pytest, and Playwright execution.
- Validate clean-checkout simulation from repository root using `--frozen-lockfile` and `--locked`.
- Author `docs/release-0.1-hardening-report.md` containing release readiness verdict, version confirmation, npm package-name availability check report, public API inventory, peer dependency findings, consumer smoke results, known limitations, manual release checklist, and recommendations.