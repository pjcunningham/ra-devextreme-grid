# Phase 0 Implementation Plan — Repository Foundation

## 1. Current Repository Baseline & Status
- **Repository**: `https://github.com/pjcunningham/ra-devextreme-grid`
- **Initial Branch**: `main`
- **Initial State**: Newly initialized Git repository with no prior commits. Initial working tree contained `.idea/` PyCharm configuration and the product requirements document `.junie/plans/000-prd.md`.
- **Operating Environment**: Node.js v24.14.1, pnpm v10.20.0 on Windows.
- **Git Status**: Clean working copy ready for initial scaffolding without deleting any existing files.

## 2. Proposed File & Directory Layout
A single-package structure is chosen to avoid unnecessary monorepo complexity for Phase 0:

```text
ra-devextreme-grid/
├── .github/
│   └── workflows/
│       └── ci.yml
├── .junie/
│   └── plans/
│       ├── 000-prd.md
│       └── 001-phase-0-repository-foundation.md
├── examples/
│   └── basic/
│       ├── index.html
│       ├── main.tsx
│       └── App.tsx
├── src/
│   ├── index.ts
│   ├── DatagridDX.tsx
│   └── types.ts
├── tests/
│   ├── setup.ts
│   ├── index.test.ts
│   └── DatagridDX.test.tsx
├── .gitignore
├── .prettierignore
├── .prettierrc
├── eslint.config.js
├── LICENSE
├── package.json
├── pnpm-lock.yaml
├── README.md
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## 3. Dependency & Version Decisions
All version decisions were evaluated by querying npm package metadata directly:
- **React (`^19.0.0` dev / `^18.0.0 || ^19.0.0` peer)**: Latest React 19 is officially supported by both React-Admin 5.15 and DevExtreme React 26.1.
- **React DOM (`^19.0.0` dev / `^18.0.0 || ^19.0.0` peer)**: Aligned with React 19.
- **React-Admin (`^5.15.3` dev / `^5.0.0` peer)**: Targeted against stable v5 release line; standard open-source core APIs only (no Enterprise dependencies).
- **DevExtreme & DevExtreme React (`^26.1.4` dev / `^24.0.0 || ^25.0.0 || ^26.0.0` peer)**: Selected latest stable release with official React 19 compatibility.
- **TypeScript (`~5.8.2`)**: Meets strict typing goals while satisfying `typescript-eslint` requirements (`<6.1.0`).
- **Vite (`^6.2.0`) & `vite-plugin-dts` (`^4.5.3`)**: Fast ES module library bundling and reliable `.d.ts` generation.
- **Vitest (`^3.0.5`) & `@testing-library/react` (`^16.2.0`)**: Production testing framework with jsdom environment.
- **ESLint (`^9.21.0`) & `typescript-eslint` (`^8.24.0`)**: Modern flat configuration (`eslint.config.js`).
- **Prettier (`^3.5.1`)**: Consistent code formatting.

## 4. Build Approach & Externalisation Rules
- **Library Mode**: Vite configured with `build.lib` specifying `entry: resolve(__dirname, 'src/index.ts')`, formats `['es']`, and output file name `index.js`.
- **Declaration Generation**: `vite-plugin-dts` configured with `insertTypesEntry: true` emitting declarations to `dist/index.d.ts`.
- **Peer Externalisation**: Vite's `rollupOptions.external` externalizes all peer dependencies via exact and regex patterns:
  - `/^react(\/.*)?$/`
  - `/^react-dom(\/.*)?$/`
  - `/^react-admin(\/.*)?$/`
  - `/^ra-core(\/.*)?$/`
  - `/^devextreme(\/.*)?$/`
  - `/^devextreme-react(\/.*)?$/`
  This guarantees that neither React nor DevExtreme runtime code is bundled into `dist/`.

## 5. Theme Decoupling Strategy
- The library strictly avoids importing any DevExtreme CSS files (`devextreme/dist/css/...`).
- Visual theme selection remains entirely within the consuming application's purview.
- The example application (`examples/basic`) imports `devextreme/dist/css/dx.light.css` at its root entry.
- The `README.md` documents this requirement explicitly for developers integrating the component.

## 6. Testing Setup & jsdom Polyfills
- Testing environment: Vitest running in `jsdom`.
- `tests/setup.ts` provides:
  - `@testing-library/jest-dom/vitest` matchers.
  - `window.matchMedia` stub for DevExtreme responsive layout checks.
  - `global.ResizeObserver` mock to prevent DevExtreme grid measurement crashes in headless environments.
- Unit tests verify:
  1. Entry point exports (`DatagridDX` and prop types).
  2. Component mounting without runtime exceptions.
  3. Static record rendering.
  4. Child component composition (e.g. `<Column />`).
  5. Native DevExtreme option passthrough.

## 7. Linting & Formatting Strategy
- Flat config `eslint.config.js` incorporating `@eslint/js`, `typescript-eslint`, and `eslint-plugin-react-hooks`.
- Prettier config `.prettierrc` with single quotes, trailing commas, and 2-space indentation.
- Standard npm scripts provided:
  - `pnpm lint`
  - `pnpm format:check`
  - `pnpm format`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`

## 8. Package Export Contracts
- Primary entry point: `src/index.ts` exporting:
  - `DatagridDX`
  - `DatagridDXProps`
- `package.json` exports mapping:
  - `.` -> types: `./dist/index.d.ts`, import: `./dist/index.js`, default: `./dist/index.js`.
- Package tarball contents (`files: ["dist"]`): Only `dist/`, `package.json`, `README.md`, and `LICENSE`.

## 9. Interactive Example Architecture
- Located in `examples/basic/`.
- Minimal Vite-served page (`index.html`, `main.tsx`, `App.tsx`).
- Renders `DatagridDX` using static data, demonstrating custom column definitions and styling via imported `dx.light.css`.
- Dev script (`pnpm dev`) spins up the local Vite dev server.

## 10. Continuous Integration Pipeline
- GitHub Actions workflow `.github/workflows/ci.yml` running on pull requests and pushes to `main`.
- Node.js setup with `pnpm/action-setup` caching.
- Sequential job steps:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm lint`
  3. `pnpm format:check`
  4. `pnpm typecheck`
  5. `pnpm test`
  6. `pnpm build`
  7. `pnpm pack --dry-run`

## 11. Files Expected to be Created or Changed
- `.gitignore`
- `LICENSE`
- `package.json`
- `pnpm-lock.yaml`
- `tsconfig.json`
- `vite.config.ts`
- `vitest.config.ts`
- `eslint.config.js`
- `.prettierrc`
- `.prettierignore`
- `README.md`
- `src/index.ts`
- `src/DatagridDX.tsx`
- `src/types.ts`
- `tests/setup.ts`
- `tests/index.test.ts`
- `tests/DatagridDX.test.tsx`
- `examples/basic/index.html`
- `examples/basic/main.tsx`
- `examples/basic/App.tsx`
- `.github/workflows/ci.yml`
- `.junie/plans/001-phase-0-repository-foundation.md`

## 12. Risks, Uncertainties & Mitigations
- **jsdom measurement quirks**: DevExtreme DataGrid measures container widths which can return zero in jsdom.
  *Mitigation*: Assert against rendered DOM elements and property pass-through rather than pixel widths or layout state.
- **Accidental peer dependency bundling**: Risk of bloat or multiple React runtime instances.
  *Mitigation*: Strict Rollup externalization regexes and verification via `pnpm pack --dry-run`.
- **Peer dependency friction**: React 19 support across tools.
  *Mitigation*: Confirmed React 19 support in React-Admin 5.15 and DevExtreme 26.1; peer ranges support both React 18 and 19.
