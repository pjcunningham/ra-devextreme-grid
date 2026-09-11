# Release 0.1.0 — Hardening and Publication Readiness Plan

## 1. Executive Summary & Freeze Policy

This hardening plan defines the requirements, audit criteria, and verification procedures to transition `ra-devextreme-grid` from development version `0.0.0` into a release-candidate version `0.1.0` ready for npm publication.

The feature set is strictly frozen at **Phase 9A** (Visual Column Layout Persistence). No Phase 9B remote query-state persistence, inline editing, selection parity additions, or other new features will be introduced. Work is focused solely on:
- Public API stabilization and encapsulation of internal helpers.
- Package entry points, bundling purity, and tarball inspection.
- Peer dependency verification against tested baselines.
- Isolated consumer verification outside the workspace.
- Complete documentation overhaul oriented to developers.
- Repository hygiene, community templates, and licensing clarity.
- Security audit and zero-runtime-dependency enforcement.
- CI review and baseline timing measurements.
- Authoritative publication readiness report.

---

## 2. Audit Matrix (All 77 Items)

### 1. Read all existing project material
All plans 000–014, phase completion reports, source files, tests, examples, manifests, and configs have been reviewed. Committed Phase 9A is the definitive source of truth.

### 2. Create the release-hardening plan
Authored this file (`.junie/plans/015-release-0.1-hardening.md`) documenting all 77 audit requirements and execution steps.

### 3. Feature freeze
Strict adherence: no Phase 9B query persistence, no inline editing, no remote RA bulk actions, no new grouping/summary query mechanisms, and no commercial Pro gates.

### 4. Version the release candidate as 0.1.0
Bump version in `package.json` to `0.1.0`. Update documentation and example references. Do not create Git tags or npm releases.

### 5. Check npm package-name availability
Registry check for `ra-devextreme-grid`:
- Command: `pnpm view ra-devextreme-grid`
- Output: 404 Not Found (name appears available as of check time, but publication is required to secure it).

### 6. Public API audit
Inventory exports from `src/index.ts`:
- Stable 0.1 Public API:
  - Components: `DatagridDX`, `DatagridDXPagination`, `DatagridDXRemote`.
  - Filter helpers: `defaultGetRaFilters`, `defaultGetDxFilterValue`, `parseRaFilterKey`, `ParsedRaFilterKey`.
  - Managed types: `DatagridDXProps`, `DatagridDXPaginationProps`, `DatagridDXSelectionOptions`, `DatagridDXRowClick`, `DatagridDXFilterRowOptions`, `DatagridDXFilterContext`, `DatagridDXGetRaFilters`, `DatagridDXGetDxFilterValue`.
  - Remote types: `DatagridDXDataProvider`, `GetGridLoadOptions`, `GetGridParams`, `GetGridResult`, `GetGridSortDescriptor`, `GetGridGroupDescriptor`, `GetGridGroupPagingContext`, `GetGridGroupKey`, `GetGridGroupItem`, `GetGridSummaryType`, `GetGridSummaryDescriptor`, `GetGridSummaryValue`, `DatagridDXRemoteGroupingOptions`, `DatagridDXRemoteProps`, `DatagridDXRemoteSummaryGroupItem`, `DatagridDXRemoteSummaryOptions`.
- Encapsulated internals:
  - `createGridStore`, `normalizeLoadOptions`, `useGridLayoutPersistence`, `applyStoredLayout`, `StoredGridLayoutV1`, `isFilterValueEqual`, `isLayoutOptionPath`.

### 7. Public API freeze discipline
Only the audited components and types are exposed. No internal factories, compilers, or persistence utilities are leaked to consumers.

### 8. Generated declaration review
Manually inspect `dist/index.d.ts` and component declaration files:
- Verify `RecordType extends RaRecord` constraints.
- Verify numeric and string IDs are preserved without collapsing to `any`.
- Confirm no internal paths (`./persistence/...` or `./remote/createGridStore`) leak into declaration files.

### 9. Package entry-point review
Validate `main`, `module`, `types`, `exports`, and `files` in `package.json`. Confirm that the library outputs modern ESM (`dist/index.js`) with accompanying `.d.ts` declarations.

### 10. Externalization audit
Verify Rollup configuration in `vite.config.ts`:
- Externalize `react`, `react-dom`, `react-admin`, `ra-core`, `devextreme`, `devextreme-react`.
- Confirm zero bundled CSS, test code, Python backend, or examples in `dist/`.

### 11. Peer dependency review
Document exact tested baseline:
- DevExtreme / DevExtreme-React: `26.1.4`
- React-Admin: `5.15.3`
- React / React-DOM: `19.0.0` (also test React `18.2.0`)

### 12. DevExtreme peer range
Peer dependency: `"^26.1.0"` (or conservative `^26.1.4`). Allows patch updates within DevExtreme 26.1.

### 13. React-Admin peer range
Peer dependency: `"^5.0.0"`. React-Admin 5.x uses unified `useStoreContext` and `Store` APIs across 5.0 through 5.15.

### 14. React 18 / React 19 compatibility
Test both React 19 and React 18 in isolated consumer builds. If React 18 exhibits unresolvable peer conflicts, narrow range explicitly to tested versions.

### 15. Compatibility evidence, not exhaustive matrices
Define two clear categories:
- Tested versions: DevExtreme 26.1.4, React-Admin 5.15.3, React 19.0.0 / 18.2.0.
- Declared ranges: `devextreme: "^26.1.0"`, `devextreme-react: "^26.1.0"`, `react-admin: "^5.0.0"`, `react: "^18.0.0 || ^19.0.0"`.

### 16. Build the actual npm tarball
Run `npm pack` (or `pnpm pack`) to produce `ra-devextreme-grid-0.1.0.tgz`. Verify contents contain only `dist/`, `package.json`, `README.md`, and `LICENSE`.

### 17. Clean consumer installation is mandatory
Create an isolated consumer outside the project tree installing `ra-devextreme-grid-0.1.0.tgz` directly.

### 18. Consumer smoke app — managed grid
Compile a minimal React-Admin application with `DatagridDX`, `DatagridDXPagination`, column chooser, and layout persistence.

### 19. Consumer smoke app — remote grid
Compile a minimal remote application with `DatagridDXRemote`, `DatagridDXDataProvider`, sorting, filters, summaries, and group paging types.

### 20. Strict peer dependency installation
Run isolated consumer verification with strict peer checking to catch any undeclared runtime dependency.

### 21. No workspace leakage
Confirm consumer build succeeds without repository aliases, root TypeScript configuration, or workspace devDependencies.

### 22. Reproducible package smoke test
Add `scripts/test-package.mjs` and npm script `test:package` to automate packing, installing into a temporary directory, and running TypeScript/Vite builds.

### 23. README must be rewritten for users, not project history
Rewrite `README.md` to prioritize developer onboarding, value proposition, quick-starts, architecture differences, feature matrix, and limitations over historical phases.

### 24. Remove stale status text
Eliminate obsolete references to version `0.0.0`, past phase numbers, "not production ready", and future promises for implemented features.

### 25. Release-status wording
Use professional, cautious phrasing: "Early public release. The API is usable and extensively tested, but pre-1.0 APIs may evolve based on real-world feedback."

### 26. README opening
Clear first screen: DevExtreme DataGrid integration for React-Admin, highlighting managed (`DatagridDX` + `ListContext`) and remote (`DatagridDXRemote` + `getGrid`) modes.

### 27. Managed quick start
Concise, copyable managed grid snippet showing `List`, `DatagridDX`, columns, and `DatagridDXPagination`.

### 28. Remote quick start
Concise, copyable remote snippet showing `DatagridDXRemote`, `DatagridDXDataProvider`, and `getGrid`. Emphasize: do NOT wrap in `<List>`.

### 29. Feature matrix
Include comparison table detailing Managed vs Remote capabilities for Paging, Sort, Filtering, Grouping, Summaries, Selection, and Layout Persistence.

### 30. Known limitations
Transparently state limitations: managed mode single sort, managed client pagination, remote RA selection gap, no inline editing, and DevExtreme licensing requirement.

### 31. FastAPI reference example
Document `examples/remote-fastapi/` as a reference backend demonstrating SQLModel, SQLAlchemy, secure filtering, grouping, and Playwright E2E integration.

### 32. DevExpress licence note
State clearly that `ra-devextreme-grid` is MIT licensed, while DevExtreme is a commercial product requiring an appropriate DevExpress licence.

### 33. Independent-project disclaimer
Confirm the project is independent and not affiliated with DevExpress or Marmelab.

### 34. Licence review
Validate `LICENSE` file: MIT licence, Copyright (c) 2026 Paul Cunningham. Confirm `package.json` specifies `"license": "MIT"`.

### 35. Add CHANGELOG.md
Create `CHANGELOG.md` with version `0.1.0` detailing Added features, Architecture, Examples, Testing, and Known Limitations.

### 36. Add CONTRIBUTING.md
Create `CONTRIBUTING.md` detailing development prerequisites (pnpm, Node 22+, Python 3.13+, uv), build commands, test workflows, linting, and PR expectations.

### 37. Add SECURITY.md
Create `SECURITY.md` detailing vulnerability reporting via GitHub Security Advisories without fabricating private contact emails.

### 38. GitHub issue templates
Add `.github/ISSUE_TEMPLATE/bug_report.yml` and `feature_request.yml` requesting version and environment details.

### 39. Pull request template
Add `.github/PULL_REQUEST_TEMPLATE.md` with checklist for tests, public API impact, and documentation.

### 40. Code of Conduct
Report Code of Conduct as optional; omit creation to avoid scope creep since none currently exists.

### 41. Security/dependency review
Run `pnpm audit` and inspect results. Document that 3 moderate dev/transitive vulnerabilities exist in devDependencies (`vitest` mock, `decode-uri-component`), with zero runtime vulnerabilities.

### 42. Python audit
Inspect locked backend dependencies in `examples/remote-fastapi/backend/uv.lock` and pyproject.toml.

### 43. CI timing measurement
Record timings for all local CI stages: pnpm install, lint/format/typecheck, Vitest, build, pytest, Playwright.

### 44. Test optimization restraint
Maintain the full test suite without pruning or merging tests.

### 45. CI review
Review `.github/workflows/ci.yml`. Confirm all test, lint, format, typecheck, build, and E2E jobs pass cleanly.

### 46. Release workflow is deliberately not automated yet
No automated publish actions or secrets for 0.1.0; manual release checklist ensures human oversight.

### 47. Add RELEASING.md
Document step-by-step manual release checklist covering pre-release checks, 2FA, dry-run, publishing, and tagging.

### 48. Npm publishing command
Document exact publishing command: `pnpm publish --access public --no-git-checks`.

### 49. Publication dry run
Run `npm publish --dry-run` or equivalent and compare against inspected tarball.

### 50. package.json metadata
Update description, keywords, repository, bugs, homepage, author, license, and scripts.

### 51. Consider engines
Omit restrictive Node `engines` from `package.json` to allow maximum bundler/environment flexibility.

### 52. Consider sideEffects
Keep `sideEffects` unspecified unless complete tree-shaking safety is proven across DevExtreme React components.

### 53. Package description/keywords
Expand keywords cleanly without keyword stuffing.

### 54. TypeScript consumer quality
Ensure autocompletion, record generics, and clean declarations without fallback to `any`.

### 55. Error-message review
Verify clear prefixing in runtime error messages (`ra-devextreme-grid`).

### 56. Console-warning review
Differentiate expected DevExtreme evaluation warnings (`W0019`, `W0021`) from adapter warnings.

### 57. Accessibility sanity review
Review keyboard focus, pager navigation, selection checkboxes, and filter row accessibility.

### 58. Example sanity review
Ensure `examples/basic` runs standalone without backend, and `examples/remote-fastapi` demonstrates full remote capabilities.

### 59. FastAPI example startup
Verify clean checkout startup documentation (`uv sync --locked`, `uv run uvicorn ...`).

### 60. Windows/Linux portability review
Audit path separators, cross-platform scripts, and environment variables across all tasks.

### 61. Clean checkout simulation
Verify bootstrap commands (`pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, `uv sync --locked`, `uv run pytest`) from a clean repository state.

### 62. Package consumer must not depend on examples
Verify consumer smoke application functions without examples or backend dependencies.

### 63. No commercial Pro code yet
Confirm MIT Community scope without licensing keys or paywalls.

### 64. Commercial/support wording
Do not invent pricing or commercial SLA commitments.

### 65. Roadmap cleanup
Replace historical roadmap in README with concise forward-looking summary.

### 66. 1.0 expectations
Clearly document 0.x semantic versioning expectations.

### 67. Breaking changes before 1.0
Audit and clean any accidental exports or signatures before tagging 0.1.0.

### 68. README code must compile conceptually
Verify all code snippets in README against actual TypeScript declarations.

### 69. Link validation
Validate all internal markdown links.

### 70. GitHub metadata
Review suggested repository topics, description, and settings.

### 71. Npm README appearance
Ensure README renders effectively as the npm package overview.

### 72. Release candidate package test
Perform final tarball build and smoke test execution.

### 73. Complete regression suite
Execute Vitest (996 tests), Pytest (2,300 tests), and Playwright (35 tests).

### 74. Required commands
Execute full battery of lint, format, typecheck, test, build, pytest, and diff commands.

### 75. Release-blocker standard
Classify all findings into Blockers vs Non-Blockers.

### 76. Create release-hardening report
Create `docs/release-0.1-hardening-report.md`.

### 77. Required final report sections
Complete all 26 required report sections and provide authoritative release readiness verdict.
