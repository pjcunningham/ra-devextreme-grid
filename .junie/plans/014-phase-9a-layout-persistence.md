# Phase 9A — Visual Column Layout Persistence

## 1. Baseline and scope

Read all numbered plans 000–013 and historical unnumbered plans, and all reports through Phase 8C. Inspected managed/remote components, filtering, remote store/grouping guards, types, examples, tests, README and fresh-server browser harness. Initial Git status: clean main. GitHub API confirms the supplied public repository. Installed DevExtreme/React wrappers are 26.1.4 and React-Admin is 5.15.3; frozen install and locked UV sync pass without upgrades. Committed Phase 8C is implementation truth. Follow the user's Phase 9A requirements; older resource-derived-key suggestions are superseded by explicit keys.

## 2. API investigation before implementation

### React-Admin Store

Public `useStoreContext()` supplies `getItem`, `setItem`, `subscribe`, and removal APIs. `useStore(key, defaultValue)` reads during render and does not catch custom Store failures; it also requires a key even when persistence is disabled. Use `useStoreContext` in the shared hook, with enabled-only reads/subscriptions and narrow Store-operation error handling. No second storage provider abstraction and no browser storage access in adapter code.

`StoreContextProvider` owns setup/teardown; never call these from the adapter. Installed `memoryStore()` uses an exact-key Map, queues writes until setup, and synchronously publishes exact-key changes. Subscriptions do not emit the initial value. Subscribe then read to close the mount gap. `useRemoveFromStore(key)` returns a no-argument reset function. Applications can supply memory, default localStorageStore, or a custom public Store through Admin.

### Native state versus visual options

Nineteen retained public-API probes in `tests/layoutSemantics.test.tsx` use a real CustomStore. `state({columns:visualFields})` clears omitted column sorting/grouping, resets selection/search/page index, restores initial filter and page-size defaults, and adds one load. `state({})` also resets top-level query/interaction values. Therefore native stateStoring remains unavailable in both public prop types and disabled internally; neither full nor partial state restoration is acceptable.

Batched `columnOption` visual writes preserve runtime filter/sort/group/page/page-size/search/selection, adding zero load/byKey calls in the probe. Events have exact paths `columns[n].visible`, `.visibleIndex`, `.width`, `.fixed`, `.fixedPosition`; no-op writes emit nothing. Intermediate reorder events need not include all shifted columns, so capture a complete final projection, not event patches. Numeric definition indices are only transient native lookup handles, never stored identities.

`name` is synthesized from dataField by native; explicit name wins. Bare identifier lookup can collide with another dataField, so enumerate columns and resolve unique identities before writing via current definition handles. Generated commands are outside columnCount; explicit unnamed commands/calculated columns are skipped. Duplicate identities are ambiguous and will be skipped with a deduplicated developer warning.

Fix-first/index-first/reverse-index batches converge in probes, but use a deterministic metadata-first, order-last batch. Fixed left/right/sticky all work; final native visual order honors fixed regions. Applying old indices directly pushes new declarations aside: merge known reordered identities into their existing/default slots, preserving slots of unstored new columns.

### Adaptive hiding and widths

Installed adaptive code uses `adaptiveHidden` and layout widths independently of public `visible`. The real Chromium fixture `tests/e2e/layout-native.spec.ts` verifies wide City visible, narrow City hidden, unchanged public visible=true/width=undefined, and zero public visible/width events. Wide reload restores adaptive visibility. Native chooser checkbox hiding emits `columns[2].visible=false`. Thus never read measured cells or adaptive/internal state into preferences.

Installed best-fit code assigns `visibleWidth`, not public `width`; the same Chromium probe confirms auto sizing leaves widths undefined. Explicit resize assigns numeric public width, or percentage string when ratio sizing applies. A widget-mode drag can also assign neighboring columns explicit widths; those are part of the native user resize and may be saved. Persist public width only, not visibleWidth/bestFitWidth. Probes retain numbers, numeric strings, percentages, auto and undefined. Validate a conservative JSON-safe nonnegative numeric/pixel/percentage/auto subset. Browser resize tests must prove material geometry restoration.

The first browser attempt correctly refused occupied port 8000. Once ports were free, the unchanged runner started new Uvicorn/Vite with a new disposable seeded SQLite database and removed it after shutdown. Probe now passes. A chooser text click was corrected to the actual checkbox.

## 3. Public API and schema

Both grids gain `layoutPreferenceKey?: string`. Absent means no adapter Store reads, subscriptions or writes. Supplied key is passed unchanged; no resource suffix/prefix/default. Different keys isolate same-resource grids; compatible grids may intentionally share one, though unique keys are recommended.

Internal, non-exported-from-package schema:

```ts
interface StoredGridLayoutV1 {
  version: 1;
  columns: {
    key: string;
    visible?: boolean;
    visibleIndex?: number;
    width?: number | string;
    fixed?: boolean;
    fixedPosition?: 'left' | 'right' | 'sticky';
  }[];
}
```

Normalize entries in stable lexicographic key order. Strict version/root/columns validation; invalid root/version means ignored. Skip invalid entries/identities and all duplicate stored keys; drop invalid individual properties. Validate finite nonnegative width, supported strings, boolean flags and finite nonnegative integer indices. Unknown fields are discarded, never applied. Semantic equality compares normalized tiny deterministic schemas, not object identity; no deep-equality/debounce dependency.

Only visibility, order, explicit width and fixing are stored. Exclude filter/sort/group indices and expressions, paging, selection, focus, search, expansion, groupPaging context, caches, summaries, hidingPriority, record identity/dataSource/resource/CustomStore, semantic column options, templates and callbacks.

## 4. Shared implementation and lifecycle

Use `src/persistence/layoutState.ts` for framework-independent validation/projection/identity/order helpers, and one `useGridLayoutPersistence` hook shared by both components. Keep remote transport/backend unchanged and CustomStore memoization unaffected.

Restore at the first content-ready boundary where configured columns exist. Keep a small ref/session guard and initial/default order snapshot. Do not restore on every refresh. Apply metadata (visibility, fixing/position, width) then merged order under beginUpdate/endUpdate. Hold synchronization guard through endUpdate and capture the resulting normalized layout so restore-generated events do not save. Match only existing unambiguous identities. New/renamed columns retain defaults; removed stored columns disappear naturally at next legitimate save. Do not rewrite invalid preferences during render, initialization or refetch.

Subscribe to external valid values and adopt them on a mounted ready grid without React query state. External changes cancel older pending writes; own notifications are semantically recognized and do not restore/write back. Invalid/removal values are ignored live; removing the key guarantees configured defaults after remount/reload, not immediate live reset. Key/Store changes cleanly end the prior activation; flush pending data only to its original key, never the new key. No state setters after disposal.

Only exact visual option event paths trigger a trailing 200ms debounce. Save a complete normalized snapshot, read after the native batch has settled. Capture pending final state before disposal; flush safely on disposal/unmount/key change, with Store-only catches and no query operation. Compare against current valid Store value before writing. Catch failed Store reads/writes/subscription operations without hiding unrelated programming errors. Warnings, if used, are deduplicated per activation/key rather than each render.

Compose in existing event paths: managed sort/filter synchronization, then layout content-ready restore, then consumer content-ready once. Layout option handling joins existing internal option handling before consumer onOptionChanged once. Remote guards remain before consumer callbacks. Preserve both forwarded-ref strategies; do not substitute native data ownership.

## 5. Tests and examples

Pure schema tests cover all listed valid/invalid types, properties, duplicate keys, equality, identity and deterministic ordering/schema evolution. Mounted tests use actual native grids and memoryStore/StoreContextProvider or AdminContext: disabled, restore/save for all five properties, debounce/flush, no initial or redundant saves, external same-key propagation, key/resource isolation, corruption, additions/removals/anonymous/duplicates, consumer callbacks and refs, Store failures and reset/remount.

Managed tests directly assert no setPage/setPerPage/setSort/setFilters/onSelect calls during layout restore, authoritative hidden sorted/filtered columns, unchanged ListContext records and practical getList count evidence. Remote tests assert stable CustomStore/request shape, no query/context values introduced or saved, default query after remount, and retain all summary/group-paging regressions. Reuse existing tests rather than weakening any prior assertion.

Enable explicit unique keys in basic managed and FastAPI flat examples; native chooser/fixing/resizing/reordering and adaptive hiding on flat example. Group-paged example can have its own key to verify grouping/expansion reset.

Real FastAPI Playwright tests use fresh contexts and actual native UI: hide/show, reorder, resize, native fixing, narrow/wide adaptive contrast, filter/sort/page changes then reload with visual-only restore, and grouping/expansion reset. Capture post-reload HTTP requests and count loads; do not substitute imperative calls for persistence UI E2E. Retain native probe separately. Headed core scenarios plus screenshot inspection and console/resource errors. Keep fresh server/database guarantee unchanged. Chromium-only claims.

## 6. Documentation, verification and review

Update root README (Visual Layout Persistence, keys/Store backend, schema scope, managed List storeKey separation, explicit Phase9B boundary, useRemoveFromStore example). Update relevant example frontend documentation, not Python implementation. Add complete `docs/phase-9a-report.md` with every requested evidence/review/recommendation section; do not rewrite PRD.

Run every requested gate: frozen pnpm install, lint, format:check, typecheck, test, library/basic/remote builds, full fresh test:e2e, headed scenarios, pack JSON/tar inspection; locked UV sync, Ruff check/format check, full Pytest using configured Python 3.13.12; git diff --check/status/diff. Existing baseline 819 Vitest, 2300 Pytest, 25 Playwright stays enabled. No dependency upgrade/runtime dependency/new CI job/backend protocol changes. Dist only packaging; no tests/examples/reports/plans/databases/screenshots. No commit/push/tag/publish.

Review all requested ownership, versioning, projection, equality/debounce/flush, adaptive/auto-width, schema evolution, event/ref, query-neutral/no-extra-load and group-paging invariants before declaring complete. Report any actual limitation candidly.

## 7. Phase 9B boundary

Implement no remote query persistence in Phase9A. Report recommendations separately for page size/index, sort/filter, grouping/direction/order, groupPaging mode, expansion and selection. Visual hook must remain orthogonal so any future remote query-state design is separately opt-in and validated. Managed query state continues to belong exclusively to React-Admin.

## 8. Implementation findings and completion

The initial proposed single metadata/order batch was refined based on the retained grouped-summary reproducer. DevExtreme 26.1.4 can render grouped rows before rebuilding summary cells when widths and structural options change in one batch; deferring that mixed batch did not cure the failure. Final restore uses two synchronous public beginUpdate/endUpdate batches: widths first, then visibility/fixing/position and descending target-index order writes. The guard spans both; no refresh/repaint or extra request is needed. All three-column order permutations and content-ready/live grouped-summary restoration are tested.

The hook also flushes captured Store data on pagehide because full-document navigation need not unmount React. External Store removal cancels older pending saves and clears cached preference/comparison state without changing the live grid; disposal/pagehide cannot resurrect it. Later genuine edits save normally. Public hook signature composes native content-ready, option-changed and disposing events without changing forwarded refs.

Completed verification: 996 Vitest tests (819 existing + 177 new), 2,300 unchanged Pytest tests, 35 Playwright tests (25 existing + 10 new), and all nine application layout scenarios headed. All requested install/lint/format/typecheck/build/pack/diff checks pass. Fresh Uvicorn/Vite/database isolation is unchanged. No dependency, backend, transport, CI or Phase9B implementation changes; no commit/push/tag/publish. See docs/phase-9a-report.md for exact commands, browser geometry/HTTP evidence, limitations and Phase9B recommendations.
