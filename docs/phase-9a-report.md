# Phase 9A — Visual Column Layout Persistence

## Implementation summary

Phase 9A adds opt-in, adapter-controlled visual column layout persistence to both grids. One internal hook uses the application's React-Admin Store. No native stateStoring, new runtime dependency, storage-provider abstraction, backend/wire change, Python change, or Phase 9B query persistence is introduced.

All required gates passed: **996 Vitest, 2,300 Pytest and 35 Playwright tests**, plus all nine new layout scenarios headed. Phase 9A is complete; Phase 9B was not begun.

## Ownership model

```text
managed query state → React-Admin
remote query state  → DevExtreme
visual layout       → Phase 9A React-Admin Store preference
```

React-Admin ListController remains authoritative for managed page, perPage, sort, filters and selection. DevExtreme retains remote query ownership but Phase 9A does not save those values.

## React-Admin Store integration

The internal hook uses public `useStoreContext()` with `getItem`, `setItem` and exact-key `subscribe`. `useStore` was investigated: its render-time read is not failure-isolated and it requires a key even when persistence is disabled. Direct public Store operations allow enabled-only access and narrow error handling without placeholder keys. `StoreContextProvider` / Admin still owns Store setup/teardown.

The exact supplied key is used without resource-derived defaults, prefixes or suffixes. Installed React-Admin 5.15.3 memoryStore uses a Map with exact-key subscriptions and synchronous notifications. Unit tests use memoryStore; application default/localStorageStore/custom Store compatibility follows the public abstraction. The adapter never reads/writes window.localStorage, sessionStorage or IndexedDB. pagehide is only a lifecycle event used to flush through Store.

The default Admin Store provides its usual persistence; applications may choose a memory or appropriate server-synced custom Store. Same-key compatible mounted grids adopt valid external updates; different keys remain independent, including grids for the same resource. Cross-tab notifications depend on the supplied Store.

## Public API

```tsx
// Inside React-Admin List:
<DatagridDX<Customer> layoutPreferenceKey="customers.list.layout">
  <Column dataField="company" />
  <Column dataField="city" />
</DatagridDX>

// Standalone remote resource page:
<DatagridDXRemote<Customer> layoutPreferenceKey="customers.remote.layout">
  <Column dataField="company" />
  <Column dataField="city" />
</DatagridDXRemote>
```

No key means no adapter Store reads, writes or subscriptions. Unique keys are normally recommended; sharing is deliberate. An explicitly supplied empty string is still the exact key, not a silently substituted default. Native stateStoring remains omitted from both public prop types and disabled internally. Native nested components/imperative calls remain outside a general configuration sandbox; consumers must not turn stateStoring on through those escape hatches.

## Stored schema

Example actual V1 shape (only present, valid properties are included):

```json
{
  "version": 1,
  "columns": [
    { "key": "city", "visible": false, "visibleIndex": 2 },
    {
      "key": "company",
      "visible": true,
      "visibleIndex": 0,
      "width": 240,
      "fixed": true,
      "fixedPosition": "right"
    },
    { "key": "country", "visible": true, "visibleIndex": 1 }
  ]
}
```

The schema is internal, not a package entry-point export. Columns are normalized in case-sensitive lexicographic key order; visibleIndex carries order independently of array enumeration. A deterministic normalized-schema comparison avoids object-reference equality and any new deep-equality dependency.

Only version 1 with an object root and columns array is accepted. Invalid entries/keys are skipped, invalid individual properties are discarded, duplicate stored keys are all excluded, and unknown fields are removed. Booleans must be actual booleans; indices finite nonnegative integers; widths finite nonnegative numbers or conservative nonnegative decimal/numeric, px, %, or auto strings; fixedPosition left/right/sticky. Wrong versions, arrays/scalars/null roots and malformed columns are ignored. Rendering/refetching does not rewrite invalid preferences.

## Persisted properties

- `visible`: explicit user Column Chooser visibility.
- `visibleIndex`: native column order, merged into compatible current slots on restore.
- `width`: explicit public column width, including native resize side effects on neighbors.
- `fixed` and `fixedPosition`: native left/right/sticky fixing preferences.

## Excluded properties

No sortOrder/sortIndex; filterValue/filterValues/filterType/selectedFilterOperation; groupIndex/group direction/order; pageIndex/pageSize; selectedRowKeys/selectionFilter; focus; search text; expanded/collapsed groups; groupPaging mode/context/parent scopes; response caches; summary definitions/results/display configuration; hidingPriority; dataField/dataType/caption/allowFiltering/allowSorting/allowGrouping; callbacks/templates/calculated values; keyExpr/dataSource/CustomStore/resource; React-Admin filterValues/sort/page/perPage/selectedIds or internal List Store keys.

## Column identity

A nonempty name wins, otherwise nonempty dataField. Native 26.1.4 synthesizes name=dataField when not explicitly named. Named lookup can collide with another field; the adapter enumerates current declarations and uses numeric handles only for immediate native calls, never as persisted identities. Anonymous and native command columns are omitted. All columns with an ambiguous duplicate identity are skipped, with deduplicated warnings. Ordinary removed columns produce no warning spam.

## DevExtreme state investigation

Nineteen retained probes run against real native DevExtreme 26.1.4 and CustomStore, without mocking the grid implementation.

| Operation                            | Extra CustomStore load | Extra byKey | Query behavior                                                                                            |
| ------------------------------------ | ---------------------: | ----------: | --------------------------------------------------------------------------------------------------------- |
| `state({columns: visualProjection})` |                      1 |           0 | Clears omitted sort/group state, resets selection/search/page, restores initial filter/page-size defaults |
| `state({})`                          |                      1 |           0 | Resets top-level query/interaction state; tested existing column sort/group survives                      |
| Batched visual `columnOption`        |                      0 |           0 | Existing runtime query and selection values preserved                                                     |

Native partial state is not a merge contract safe for Phase 9A. Runtime page size 4 returned to configured 3, page index returned to 0, selected keys to [], search to empty, selectionFilter to undefined, and runtime filters to configured initial values. Native state restoration also did not emit the individual column events expected from public option writes.

Visual writes emit exact `columns[n].visible`, `.visibleIndex`, `.width`, `.fixed`, `.fixedPosition` paths with name=columns; no-op writes emit nothing. Reordering may shift other columns without individual events. All four permission combinations (resizing/reordering enabled/disabled) and left/right/sticky positioning were probed. Descending target-index assignments preserve unstored column slots and all three-column permutations are tested. Native fixed regions govern rendered left/sticky/right order, not JSX order.

**Integration finding:** one mixed width/structural batch can make DevExtreme render grouped rows before rebuilding summary cells, throwing in `_hasAlignByColumnSummaryItems`. Deferring the same mixed batch alone did not fix it. The final helper first batches widths, then batches visibility/fixing/position and merged order. The guard spans both synchronous batches. Retained content-ready and live-restore tests exercise the failure case; total/group summaries and lazy expansion work with exactly one initial remote request. No refresh/repaint workaround, query mutation, private API or catch masking the native error was introduced.

## Adaptive hiding investigation

Installed code uses `adaptiveHidden` and layout-only widths, rather than public visible=false. A retained Chromium native fixture starts wide with City visible, narrows until its header disappears, and verifies public City visible=true and width undefined throughout, with no public visible/width option events. Wide reload shows City. Clicking the native chooser checkbox instead emits columns[2].visible=false.

The adapter captures only public options and matches only whitelisted event paths: neither internal adaptiveHidden nor measured geometry is persisted. No viewport-specific persistence hack is used. Real frontend adaptive-versus-user-hiding evidence is recorded below.

## Auto-width/resizing investigation

Native best-fit sizing writes visibleWidth, not public width. The browser probe confirms automatically sized widths remain undefined after initial layout and viewport changes. Explicit resize writes public numeric width (or percentage under native ratio sizing). Native widget-mode resizing may assign other columns explicit widths as part of the user gesture; these are saved intentionally.

Numbers, numeric strings, percentages, auto and undefined retain their types in native probes. No visibleWidth/bestFitWidth/cell geometry is stored. Programmatic application changes to the same public visual options are indistinguishable from user changes after initialization and are treated as layout edits. Continuously controlled React visual props may override restored preferences; applications should avoid competing control.

## Restore lifecycle

Configured columns must exist before restoration. The hook receives the native component at content-ready, keeps an activation/default-layout guard, and does not restore on every data refresh. External valid Store updates are adopted by mounted ready grids; own notifications do not reapply or write back. Key/provider changes end the previous activation and bind new work to the new exact key.

Apply only existing unique identities: widths in the first update batch, then visibility/fixing/position and merged order in the second. The feedback guard spans both batches through native update completion. Consumer events remain composed once through existing managed/remote event handlers; managed sort/filter sync remains authoritative and remote guards remain active. Both forwarded native refs stay intact.

## Save lifecycle

Only the five exact visual option paths schedule a save. A complete projection is captured, including a microtask follow-up after native reorder shifts settle; a 200ms trailing timer coalesces resizing bursts. Semantic equality against the last applied and current valid stored projection suppresses redundant writes. No initial restore write occurs.

Pending snapshots flush on disposal/unmount/key/Store changes to their originating Store/key. A pagehide listener covers full browser navigation where React unmount is not guaranteed; it flushes the captured snapshot without reading a disposed grid or using raw browser storage. Cleanup removes the listener/timer/subscription. External valid updates supersede pending local saves. Removal cancels older pending saves and rebases comparison state without changing the live grid, preventing debounce/unmount/pagehide from resurrecting a removed preference. Later genuine edits save normally. Store failures are isolated and warned once per activation/operation; unrelated programming errors are not intentionally swallowed.

## Schema evolution

| Change                          | Behavior                                                                    |
| ------------------------------- | --------------------------------------------------------------------------- |
| New column                      | Retains current configured visibility/width/fixing and default order slot   |
| Removed column                  | Stored entry ignored; next real save captures current columns only          |
| Renamed name/dataField identity | Treated as new; no caption/index heuristics                                 |
| Malformed old state             | Ignored wholly or per invalid entry/property, without initialization writes |
| Wrong version                   | Ignored; no app-wide Store version bump required                            |
| Duplicate identity              | All ambiguous entries skipped with deduplicated warning                     |

## Managed-mode evidence

Mounted real-grid tests restore hidden country/company with country=UK and company ASC. They directly assert zero setPage/setPerPage/setSort/setFilters/onSelect calls, unchanged ListContext record ownership, authoritative native sort/filter/selected keys, and intact forwarded refs/callback composition. A real ListBase fixture asserts exactly one getList with the configured filter/sort/pagination. All pass in the full 996-test suite.

## Remote-mode evidence

A real CustomStore fixture injects legacy/malicious query fields into the stored object and proves only visual options apply. It checks stable native instance and CustomStore across Store saves/rerenders, default request shape, no getList usage, and identical getGrid shape on an explicit refresh. A JSX-column group-paged fixture covers total/group summaries and lazy expansion. All 14 new mounted-grid tests pass, including the grouped-summary regression described above.

## Query-request evidence

Native columnOption probes: zero additional loads/byKey versus one load for partial native state. Mounted ListBase: one initial getList; remote flat and grouped fixtures: one initial getGrid, no layout-induced request, identical explicit-refresh request. Browser UI-only layout changes add **zero HTTP loads**; each reload issues exactly one configured/default query. Flat reload uses skip=0, take=10 and no sort/filter. Group-paged reload uses take=3, the default Country/Company collapsed group descriptors/context, and no restored leaf cache or expansion.

## Browser E2E evidence

**35/35 full Chromium tests pass**, retaining all 25 Phase 8C cases and adding one native investigation plus nine application scenarios. The nine application scenarios also passed **9/9 headless and 9/9 headed**, zero retries, approximately 2.2 minutes per focused run.

| Scenario             | Actual browser evidence                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Visibility           | Native chooser hide and show both survive reload                                                                            |
| Order                | Actual mouse drag reorders columns and restores after reload                                                                |
| Width                | ID width 70.03125px → 150.09375px → 150.09375px after reload; tolerant geometry assertions                                  |
| Headed width         | 70.02499px → 150.08749px → 150.08749px                                                                                      |
| Fixing               | Native context-menu fix and unfix both survive reload                                                                       |
| Adaptive distinction | City disappears responsively at 900px, returns on wide reload; chooser-hidden City stays hidden                             |
| Remote query reset   | Country filter, Company sort, page 2 and size 5 reset to default page 1/size 10 with no sort/filter request; layout remains |
| Grouping reset       | Both reorder and ungroup cases return to default collapsed Country/Company; re-expansion makes fresh leaf requests          |
| Key isolation        | Flat and group-paged layouts remain separate across resource navigation                                                     |

Tests use actual chooser, mouse drag/resize, native fixing menu, Filter Row, pager and grouping UI, with HTTP evidence and screenshot attachments. Isolated contexts begin without old preference state; reloads intentionally retain the current context's Store. No adapter-internal method replaces persistence UI assertions. No unexpected application console/page errors or resource 404s occurred; DevExtreme license/evaluation warnings are explicitly separate.

The unchanged fresh runner verifies ports 8000/5174 free and database absent before startup, launches new Uvicorn/Vite, verifies the deterministic 100-record seed, stops its children and removes the disposable SQLite database afterward. An initially occupied port was correctly rejected, not reused or force-killed.

Artifacts from the final full run are under ignored `test-results/layout-persistence-*/`: `layout-http-and-errors.json`, `resize-geometry.json`, before/after screenshots and test attachments. Resized-after-reload, adaptive-narrow, and adaptive-wide-reload screenshots were inspected. The adaptive scenario intentionally tests 900px desktop layout; 500px mobile navigation/drawer behavior was not claimed or substituted for persistence coverage.

## React-Admin Store reset

```tsx
const removeLayout = useRemoveFromStore('customers.list.layout');
// Application event handler:
removeLayout();
```

Remount/reload uses current configured defaults. Removal does not immediately reset the mounted grid; subsequent new user changes may save again. No library reset component or separate persistence framework was added.

## Files changed

- `src/persistence/layoutState.ts`, `useGridLayoutPersistence.ts`: shared schema/projection/native restoration and Store lifecycle.
- `src/DatagridDX.tsx`, `DatagridDXRemote.tsx`, `types.ts`: public key and composed native events; unchanged query/transport ownership.
- `tests/layoutSemantics.test.tsx`, `layoutState.test.ts`, `useGridLayoutPersistence.test.tsx`, `DatagridDXLayoutPersistence.test.tsx`: retained API probes and pure/hook/mounted regressions.
- `tests/e2e/layout-native.spec.ts`, `layout-persistence.spec.ts`, native fixture: real Chromium behavior.
- Basic managed and FastAPI flat/group-paged examples: explicit distinct keys and native visual controls.
- Root/example README, `.junie/plans/014-phase-9a-layout-persistence.md`, this report.

## Test counts

| Suite      | Phase 8C baseline | Phase 9A final |
| ---------- | ----------------: | -------------: |
| Vitest     |               819 |     996 passed |
| Pytest     |             2,300 |   2,300 passed |
| Playwright |                25 |      35 passed |

Vitest additions: 19 retained native API probes, 117 schema/native-helper tests, 27 Store-hook tests and 14 mounted managed/remote tests. The 996 tests run in 29 files. Headed smoke is an additional run of the same nine application E2E tests, not added to the 35 unique-browser-test count.

## Regression status

All frontend, backend and browser suites pass, including Phase 8C flat, complete-tree and lazy group-paging regressions, total/group summaries and fresh-server isolation. No prior test was disabled, removed or weakened. No backend Python, transport, lockfile, dependency or CI file changed.

## Verification

| Required command                                                           | Result                             |
| -------------------------------------------------------------------------- | ---------------------------------- |
| `pnpm install --frozen-lockfile`                                           | Passed; lockfile unchanged         |
| `pnpm lint`                                                                | Passed                             |
| `pnpm format:check`                                                        | Passed                             |
| `pnpm typecheck`                                                           | Passed                             |
| `pnpm test`                                                                | 996 passed                         |
| `pnpm build`                                                               | Passed; 15 modules, 39.46 kB JS    |
| `pnpm build:example`                                                       | Passed                             |
| `pnpm build:remote-fastapi`                                                | Passed                             |
| `pnpm test:e2e`                                                            | 35 passed; fresh isolated servers  |
| `pnpm test:e2e:headed tests/e2e/layout-persistence.spec.ts`                | 9 passed                           |
| `pnpm pack --json`                                                         | Passed; 22 files inspected         |
| `uv sync --locked --directory examples/remote-fastapi/backend`             | Passed                             |
| `uv run --directory examples/remote-fastapi/backend ruff check .`          | Passed                             |
| `uv run --directory examples/remote-fastapi/backend ruff format --check .` | Passed; 27 files already formatted |
| `uv run --directory examples/remote-fastapi/backend pytest`                | 2,300 passed, 6 warnings, 9.40s    |
| `git diff --check`                                                         | Passed                             |
| `git status`                                                               | Reviewed; only intended task files |
| `git diff`                                                                 | Reviewed                           |

Python preflight confirmed project UV-managed Python 3.13.12. IDE build reports success but limited diagnostic collection, so CLI gates remain authoritative. Builds emit existing dependency use-client/large-chunk warnings; negative unit tests intentionally emit validation errors and DevExtreme license diagnostics. An initial format check identified the retained probe; formatting was corrected and the final check passed. No commit, push, tag or publish.

## Package inspection

`pnpm pack --json` and `tar -tf` confirm **22 files**: license, package metadata, README, bundled dist/index.js and source map, and declarations including the persistence modules. Public entry-point exports remain intentionally small; internal schema declarations are not exported by index. Persistence runtime code is included in the normal bundle. No tests/examples/backend/Playwright reports/screenshots/.junie/docs reports/databases are packaged. The generated tarball was removed after inspection; generated build/browser artifacts remain ignored.

## Deviations

- Public useStoreContext rather than useStore: permits truly disabled persistence and locally isolated custom Store failures without render reads or synthetic keys.
- Retained small native probes instead of deleting research evidence.
- Added pagehide flush in addition to React cleanup to cover full-document navigation.
- Split native restore into widths-first and structure/order batches after the retained grouped-summary reproducer exposed a mixed-batch native rendering issue.
- No backend/protocol/dependency/CI change; Phase 9B remains unimplemented.

## Known limitations

- Only visual layout persistence; remote query state deliberately does not persist.
- Managed query persistence remains React-Admin ListController responsibility.
- No selection/focus persistence, saved named layouts, or server-synced preferences unless the application provides a suitable Store.
- Reset is defined after remount/reload, not immediate live default restoration.
- Automatic measured widths/adaptive hiding are excluded. Explicit resizing can assign neighboring widths; later programmatic public visual changes are also saved.
- Whitelisted simple column option paths are supported; no generic nested-band/reconfiguration state framework is promised.
- Browser verification is Chromium-only, not Firefox/WebKit or every native drag/touch platform.
- Existing DevExtreme evaluation/license messages and Phase 8C limits remain separate from application failures.

## Risks or concerns

Visual options must not compete with continuously controlled application props. Explicit keys are application-owned and can collide if reused accidentally. Custom Store operations can fail or partially mutate before throwing; the adapter cannot supply transaction guarantees for arbitrary Stores. Phase 9A avoids persistence-driven data reloads in the measured cases, but future DevExtreme versions need these API probes rerun, especially the grouped-summary width/structure ordering regression. No known unresolved Phase 9A failure remains in the verified scope.

## End-of-phase architecture review

- Public Store only, opt-in exact keys, internal versioned whitelist and deterministic equality: verified by pure/memoryStore tests and package inspection.
- Managed ownership, remote non-persistence, stable CustomStore, refs/events once, summaries/group paging and no added requests: verified by mounted tests plus the full browser regression suite.
- Restore feedback protection, 200ms debounce, disposal/pagehide flush and reset-race cancellation: covered by hook lifecycle tests, including StrictMode and Store failures.
- Explicit chooser hiding/order/width/fixing versus adaptive/auto-width behavior: verified in native probes and actual headless/headed UI.
- New/default slots, removed/renamed/ambiguous columns and malformed legacy values: covered without initialization writes or heuristic identity matching.
- Phase 9B stays separate; no query, selection, focus, summary or cache state enters the stored visual schema.

## PRD feedback

Record, do not silently rewrite, these findings: native state(partial) is not query-neutral; React-Admin public Store is sufficient without another provider API; exact keys avoid resource-view collisions; schema-local versioning is necessary for long-lived complex preferences; adaptiveHidden/visibleWidth are not user state; column additions require slot merging; browser navigation needs more than React cleanup; remote query persistence must be a separate projection with capability/schema validation. The original single Phase 9 should remain split into 9A and 9B.

## Phase 9B recommendation

| Remote state          | Recommendation              | Reason                                                                                                                            |
| --------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Page size             | Persist                     | Durable user preference, if bounded by configured/backend limits                                                                  |
| Page index            | Do not persist              | Stale after data/filter/group changes; start at a safe first page                                                                 |
| Sort                  | Persist                     | Useful preference with explicit selector/direction validation against current columns/backend capabilities                        |
| Filter                | Needs further investigation | Typed/date serialization, schema evolution, privacy, permanent application filters and supported operators need a separate design |
| Grouping              | Needs further investigation | Must validate depth, selectors, lazy versus complete-tree invariants and application capability changes                           |
| Group direction/order | Needs further investigation | Must persist atomically with validated grouping, not as independent visual indices                                                |
| groupPaging mode      | Do not persist              | Application/backend capability configuration, not a user preference                                                               |
| Expanded groups       | Do not persist              | Transient scoped paths, potentially stale/large; never persist caches or response pages                                           |
| Selection             | Do not persist              | Remote selection parity is absent; managed selection belongs to React-Admin                                                       |

No Phase 9B state has been implemented.

## Phase 9B readiness

**Ready as a clean base for Phase 9B**, with all required gates green. The shared visual hook has an orthogonal public key and small versioned projection; it does not reach into query/transport or managed List Store state. Phase 9B should introduce a separately reviewed remote-only opt-in schema/restore lifecycle, not widen this visual preference silently. Phase 9B was not begun.
