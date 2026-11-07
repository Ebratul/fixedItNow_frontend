# Performance changelog

Every performance optimization is recorded here after it is made: **what** changed, **which files**, **why**, and
**which requirement** it serves, with the measurement that justifies it (before / after, on the seeded data set
below). Newest entry first.

Requirements referenced (from `backend/docs/SRS.md`):

- **SRS 5.3-a**: "Avoid unbounded database queries and large unpaginated lists."
- **SRS 5.3-b**: "Optimize public images and use appropriate caching."
- **SRS 5.3-c**: "Establish measurable performance budgets during implementation rather than claiming untested scores."
- **SRS Phase 10**: "Load/performance checks appropriate to the target release."

Entry template:

```
## YYYY-MM-DD: <short title>
- Type: optimization | tooling | measurement
- What: <the change, in one or two sentences>
- Files: <path:line, ...>
- Why: <the measured problem: page/endpoint, data size, before numbers>
- Requirement: <SRS id(s)>
- Result: <after numbers, same data set and method as "before">
- Verified by: <tests / commands run>
```

---

## 2026-11-07: Dashboard charts: hidden table only when open, lazy-loaded chart with an equal-height skeleton (optimization)

- **Type:** optimization.
- **What:**
  - `BarChart` renders its "Show as table" table only while the `<details>` is open (`onToggle` → state). Before, a
    closed chart still rendered one table row per day on every update.
  - The chart is loaded through `next/dynamic` (`LazyBarChart`) as its own chunk. `next/dynamic` sits in a Client
    Component module, because Next does not code-split a Client Component that a Server Component imports
    dynamically.
  - While the chunk loads, `BarChartSkeleton` has the chart's exact box: 250 px (caption 20 + plot 160 + table
    line 16 + spacing and padding).
  - `BarChart` now takes `unit: "count" | "bdt"` instead of a `format` function, so a Server Component can render it.
- **Files:**
  - `src/components/admin/dashboard/bar-chart.tsx`;
  - `src/components/admin/dashboard/lazy-bar-chart.tsx` (new);
  - `src/components/admin/dashboard/dashboard-view.tsx`;
  - `src/__tests__/admin-dashboard.test.tsx` (new test: table only while open);
  - `scripts/perf/profile-select.mjs` (new).
- **Why:** B6 in `before/bottlenecks.md`. A 90-day period rendered 3 × 90 bars plus 3 × 90 hidden table rows.
- **Requirement:** SRS 5.3-a (bounded rendering), 5.3-c, Phase 10.
- **Result:**
  - Period change, slowest React commit (`node scripts/perf/profile-select.mjs /admin dash-days 7 90 30`, 3 runs,
    :3101 dev):

    | Period | Before | After |
    | --- | --- | --- |
    | 7 days | 6.3–9.3 ms | **3.9–4.1 ms** |
    | 30 days | 15.0–15.6 ms | **6.9–9.7 ms** |
    | 90 days | 49.0–52.9 ms | **16.8–18.3 ms** |

  - Skeleton vs chart height, with the chart chunk delayed 2.5 s in headless Chrome: 250 = 250 px at 1440 and 390 px.
    The swap caused no layout shift. The page's only shift, 0.026 on desktop, comes from the site header nav and is
    unrelated; the baseline Lighthouse already had CLS 0.02.
  - The chart is a separate chunk (`src_components_admin_dashboard_bar-chart_tsx_*`).
  - Bundle sizes come with the "after" bundle report.
- **Verified by:**
  - `tsc`, eslint (0 warnings), vitest 432/432;
  - the headless height and CLS check above;
  - opening one "Show as table" renders exactly one table.

## 2026-11-07: Scroll-linked UI of the virtualized lists: rAF throttle, scroll position in a ref (optimization)

- **Type:** optimization.
- **What** (all in the shared `useVirtualRows` hook, so it applies to both /admin/users and /admin/audit):
  - **Scroll-linked UI:**
    - a soft shadow under the sticky users-table header once rows scroll under it;
    - a "Rows 73–82 of 1,507" / "Entries 70–79 of 2,003" line under each list.
  - **Throttling:**
    - the scroll position lives in a ref (`scrollTopRef`), never in state;
    - a scroll event only requests one `requestAnimationFrame`;
    - that frame reads the position once, and sets state only when `scrolled`, `first` or `last` really changes.
  - **`useFlushSync: false` for TanStack Virtual:** by default it forced a synchronous React commit on every scroll
    event. Now React batches the updates of one frame.
  - **Keyboard safety:** without the synchronous commit, a fast Tab could move focus past the rendered rows, because
    the scroll event comes a frame later. So the keyboard-focused (`:focus-visible`) row is kept in state, and the
    window always reaches `overscan` rows past it. Mouse focus is ignored, so a click never shifts the row under the
    pointer.
- **Files:**
  - `src/components/admin/kit/use-virtual-rows.ts`;
  - `src/components/admin/kit/virtual-data-table.tsx`;
  - `src/components/admin/people/audit-view.tsx`;
  - `scripts/perf/scroll-sweep.mjs` (new).
- **Why:** scroll-driven UI must not re-render on every scroll event, and the virtualizer itself committed once
  per scroll event.
- **Requirement:** SRS 5.3-c, Phase 10.
- **Result** (`node scripts/perf/scroll-sweep.mjs <page> <select> <All value>`; 150 scroll events of 40 px, 4 per
  frame; 3 runs; :3101 dev):

  | | Users, before | Users, after | Audit, before | Audit, after |
  | --- | --- | --- | --- | --- |
  | React commits during the sweep | 142 | **31** | 114 | **31** |
  | Render time, all commits | 335–343 ms | **174–180 ms** | 125–130 ms | **76–84 ms** |
  | Slowest commit | 11–11.7 ms | 13.1–14.8 ms | 2.6–4.3 ms | 3.0–5.3 ms |

  "After" includes the new header shadow and range line. The slowest single commit is slightly larger, because
  one commit now covers up to 4 scroll events.
- **Verified by:**
  - `tsc`, eslint (0 warnings), vitest 431/431;
  - users browser checks 24/24, run twice; audit checks all passing;
  - a Tab trace after scrolling to the bottom and back: focus stays in the table (row 24 after 22 Tabs);
  - the header shadow appears once scrolled.

## 2026-11-07: Finance what-if commission rate: state colocation + debounce (optimization)

- **Type:** optimization.
- **What:**
  - The what-if rate field of the commission report is its own component, `WhatIfRateInput`, which owns its text
    state.
  - Validation shows at once.
  - A valid rate reaches the report after 400 ms of quiet, from a timer in the handler (no effect). Debounce was
    chosen over `useDeferredValue` because each applied rate is an API request: deferring a render would still
    fetch on every key.
  - "Invalid" is reported only when it flips, to disable the export.
  - The CSV export now uses the rate the report shows. Before, it used the live, not yet applied text.
- **Files:** `src/components/admin/ops/finance-view.tsx` (`WhatIfRateInput`, `CommissionReport`).
- **Why:** B5 in `before/bottlenecks.md`: typing re-rendered the whole report (Alert, Card, 4 StatCards) on every
  key.
- **Requirement:** SRS 5.3-c, Phase 10.
- **Result** (`node scripts/perf/profile-typing.mjs /admin/finance commission-rate 1250`, 3 runs, :3101 dev):

  | | Before | After |
  | --- | --- | --- |
  | Keystroke commits for 4 keys | 5 | 4 |
  | Slowest keystroke commit | 3.1–4.6 ms | **0.6–0.7 ms** |
  | All keystroke commits together | 9.0–11.7 ms | **1.2–1.7 ms** |
  | Report requests for "1250" | 1 (after 400 ms) | 1 (after 400 ms) |

- **Verified by:**
  - `tsc`, eslint (0 warnings), vitest 431/431;
  - headless check: "12a" shows the error and disables Export, "1250" applies 12.5 % and re-enables it, and an
    empty field returns to the configured rate; no console errors.

## 2026-11-07: Users filter form as its own component (state colocation) (optimization)

- **Type:** optimization (structure). The measured gain is small; see Result.
- **What:**
  - The search box and the four selects of /admin/users moved into `UsersFilterForm`, which owns their input state.
  - `UsersList` keeps only the applied filters and the page.
  - A select reports its value from its own `onChange`. The search text is reported by a 300 ms timer in the
    handler (`SEARCH_DEBOUNCE_MS`). No effect syncs the two components; a first version that did doubled the
    commits after the debounce, 2 → 4, so it was replaced.
  - A real filter change resets the page to 1.
- **Files:**
  - `src/components/admin/people/users-list.tsx`;
  - `scripts/perf/profile-typing.mjs` (new): React commit times while typing, read through a minimal DevTools hook
    in dev mode.
- **Why:**
  - B3 in `before/bottlenecks.md`: every keystroke re-rendered the users page.
  - Typing should touch only the input.
- **Requirement:** SRS 5.3-c, Phase 10.
- **Result** (`node scripts/perf/profile-typing.mjs /admin/users user-search rahman [user-page-size=2000]`, 3 runs
  each, :3101 dev):

  | | Before (previous commit) | After |
  | --- | --- | --- |
  | Keystroke commits for 6 keys | 6–7 | 6 |
  | Slowest keystroke commit | 1.1–1.4 ms | 0.8–1.2 ms |
  | All keystroke commits together (All shown) | 5.1–6.3 ms | 3.7–5.2 ms |
  | Commits after the debounce | 2 | 2 |

  Honest reading: even before, a keystroke did not re-render the table. The React Compiler (on in this project)
  already memoizes the list, so it was skipped when its props did not change. The 8.7 ms DataTable commit in the
  baseline profile is a data commit (new rows), not a keystroke. Colocation makes this independent of the
  compiler and trims the keystroke total by about 20 %.
- **Verified by:**
  - `tsc`, eslint (0 warnings), vitest 431/431;
  - the users-table browser script (24 checks) still passes.

## 2026-11-07: AbortController for API reads; search requests counted (optimization)

- **Type:** optimization.
- **What:**
  - `api()` takes an `AbortSignal`.
  - `useApi` gives every request its own `AbortController` and aborts it when the path changes (the next debounced
    search, a filter, a page) or the view unmounts. An aborted request is not reported as an error.
  - The 300 ms debounce on the /admin/users and /admin/bookings search boxes was already there (`useDebounced`),
    and is kept.
- **Files:**
  - `src/lib/api.ts`, `src/lib/use-api.ts`;
  - `src/__tests__/use-api-abort.test.tsx` (new);
  - `scripts/perf/count-search-requests.mjs` (new);
  - `docs/performance/after/search-requests.md`.
- **Why:** on a slow connection, every debounced query still ran to completion even when a newer one had
  replaced it.
- **Requirement:** SRS 5.3-a, 5.3-c, Phase 10.
- **Result** (6 keys, "rahman", the same on both pages; details in `after/search-requests.md`):
  - Fast typing: no debounce = 6 requests; with the 300 ms debounce = 1.
  - Slow network (600 ms latency, pauses):
    - before: 3 sent, all 3 completed;
    - after: 3 sent, **2 aborted**, 1 completed.
- **Verified by:**
  - `tsc`, eslint (0 warnings), vitest 431/431, including the new tests:
    - the old request is aborted on a path change, and its late answer is ignored;
    - abort on unmount sets no error;
  - the headless counts above.

## 2026-11-07: Virtualized /admin/audit list; metadata stringified only for open entries (optimization)

- **Type:** optimization.
- **What:**
  - Above 100 entries (in practice "All (2000+)"), the audit list renders through TanStack Virtual with overscan 10.
    Only the entries in the scroll area plus 10 on each side are mounted, between two spacer `<li>`s.
  - Each entry renders its details (metadata `JSON.stringify(…, null, 2)`, hash) only while it is open. Before,
    every closed `<details>` carried its stringified metadata.
  - Which entries are open is kept by id in the list, so an opened entry stays open when it scrolls out and back.
  - Up to 100 entries still render as the plain list.
  - The windowing now lives in a shared hook `useVirtualRows`, used by `VirtualDataTable` (users) too.
- **Files:**
  - `src/components/admin/kit/use-virtual-rows.ts` (new);
  - `src/components/admin/kit/virtual-data-table.tsx` (uses the hook; no behaviour change);
  - `src/components/admin/people/audit-view.tsx` (`AuditList`, `VirtualAuditList`, `Entry` with `open`).
- **Why:** `before/audit-all.md`. All mounted 2,003 entries / 28,527 DOM nodes, with 457 ms of render after the
  response and long tasks of 241 + 173 ms.
- **Requirement:** SRS 5.3-a, 5.3-c, Phase 10.
- **Result** (same method, `scripts/perf/measure-list.mjs`, median of 3 runs, :3101 dev):

  | | Before | After |
  | --- | --- | --- |
  | Render after response | 457 ms | **62 ms** |
  | Switch to All, total | 517 ms | **125 ms** |
  | Entries mounted | 2,003 | **20** |
  | DOM nodes on the page | 28,527 | **667** |
  | Long tasks on switch | 241 + 173 ms | **none** |
  | Long tasks while typing | 77 ms | **none** |

- **Verified by:**
  - `tsc`, eslint (0 warnings), vitest 429/429;
  - headless Chrome at 1440 and 390 px:
    - 25 per page stays a plain list;
    - closed entries render no details;
    - All is windowed (14–17 mounted);
    - Enter on a summary opens it;
    - the last entry (2,003) is reachable;
    - an opened entry is unmounted far away and is still open after scrolling back;
    - no page-level horizontal scroll, no console errors;
  - the users-table check script still passes 24/24.

## 2026-11-07: "All (2000+)" page size on /admin/audit + baseline measurement (tooling)

- **Type:** tooling and measurement. No optimization.
- **What:** /admin/audit has an "Entries per page" menu: 25 (default), 100, or "All (2000+)". All asks for
  `pageSize=5000`, the backend's only accepted size above 100, which is the same bound as the CSV export.
- **What else:** `scripts/perf/measure-list.mjs` measures a long list in headless Chrome. It reports switch time,
  render time after the response, DOM items and nodes, long tasks, and key-event latency while typing.
- **Files:**
  - frontend `src/components/admin/people/audit-view.tsx`, `scripts/perf/measure-list.mjs`,
    `docs/performance/before/audit-all.md`;
  - backend `src/admin/audit/audit.controller.ts` (`AUDIT_ALL_PAGE_SIZE`), `test/admin-audit-settings.e2e-spec.ts`.
- **Why:** to get a baseline for the audit virtualization (next entry).
- **Requirement:** SRS 5.3-a (still bounded), 5.3-c, Phase 10.
- **Result (before):** median of 3 runs, details in `before/audit-all.md`:
  - render after response 457 ms;
  - 2,003 entries / 28,527 DOM nodes;
  - long tasks of 241 + 173 ms on the switch.
- **Verified by:** backend `tsc`, unit tests 151/151, and `admin-audit-settings` e2e 15/15 (5000 accepted; 101, 1000
  and 5001 rejected); frontend `tsc` and eslint.

## 2026-11-07: Virtualized /admin/users table for long results (optimization)

- **Type:** optimization.
- **What:** with more than 100 rows (in practice "All (1000+)"), /admin/users renders through the new
  `VirtualDataTable`. It uses TanStack Virtual (`@tanstack/react-virtual` 3.14.21, pinned), with overscan 10. Only
  the rows in the scroll area plus 10 on each side are in the DOM, and two spacer rows stand in for the rest.
  - 20 and 50 per page keep the plain `DataTable`, unchanged.
  - The table is still a real `<table>`: caption, `scope` headers, the row header cell, `aria-rowcount` and
    `aria-rowindex`.
  - Fixed layout with column widths, so the columns do not jump while scrolling. Sticky header row. The scroll
    area is focusable and keyboard-scrollable.
  - Below md / lg, the hidden columns are left out of the DOM.
- **Files:**
  - `src/components/admin/kit/virtual-data-table.tsx` (new);
  - `src/components/admin/kit/data-table.tsx` (`renderCells` / `hideCell` shared, output unchanged; `Column.width`);
  - `src/components/admin/people/users-list.tsx` (`VIRTUALIZE_ABOVE = 100`, `OVERSCAN = 10`, column widths);
  - `package.json` / `package-lock.json`.
- **Why:** with "All (1000+)", the plain table renders all 1,507 rows (about 9,000 cells) on every commit, including
  every keystroke in the search box (B3 in `before/bottlenecks.md`).
- **Requirement:** SRS 5.3-a (large lists), 5.3-c, Phase 10.
- **Before** (commit `2f1a46b`: "All (1000+)" without virtualization; :3101 dev, React Profiler,
  admin@rentnest.com):
  - Profile file: `docs/performance/<label>/profiler/users-all-before.json`
  - Commit when switching to "All (1000+)": ___ ms (DataTable ___ ms)
  - One keystroke in the search box, with All shown: ___ ms
  - Scrolling: ___
  - Rows / cells in the DOM: 1,507 rows / ≈ 9,000 cells
- **After** (this commit, same steps):
  - Profile file: `docs/performance/<label>/profiler/users-all-after.json`
  - Commit when switching to "All (1000+)": ___ ms (VirtualDataTable ___ ms)
  - One keystroke in the search box, with All shown: ___ ms
  - Scrolling commits: ___ ms each
  - Rows in the DOM: 19–31 (measured: 19 at the top, 31 in the middle; 10 visible + 2 × 10 overscan)
  - Bundle: /admin/users First Load JS ___ kB (`bash scripts/perf/bundle-report.sh after-virtual`)
- **Verified by:**
  - `tsc`, eslint, and vitest (106/106);
  - headless Chrome on :3101, 24 checks: desktop 1440, tablet 820 and mobile 390 for 20 / 50 / All; header–body
    column alignment (0 px difference); sticky header; last row 1,508 reachable; Tab ×40 reaches row 42 with the
    link visible below the header; End key; a link click from a scrolled row; no console errors;
  - axe: no violations on the table;
  - resizing from mobile to desktop brings the hidden columns back.
  - There is no dark mode in the app (no dark theme in `globals.css`), so it was not tested.

## 2026-11-07: "All (1000+)" page size on /admin/users (tooling, sets up the next optimization)

- **Type:** tooling. This is a stress setting for measurement, not an optimization; no virtualization yet.
- **What:** /admin/users has a "Rows per page" menu: 20 (default), 50, or "All (1000+)". All asks for
  `pageSize=2000`, which is the backend's only accepted size above 50. With the perf seed it shows all 1,507 users
  in one table.
- **Files:**
  - frontend `src/components/admin/people/users-list.tsx` (`PAGE_SIZES`, the `user-page-size` select);
  - backend `src/admin/users/users.controller.ts` (`USERS_ALL_PAGE_SIZE`; `pageSize` must be 1–50 or 2000);
  - backend `test/admin-users.e2e-spec.ts`.
- **Why:** to get a realistic large-table baseline (1,500 rendered rows) to measure the planned table optimizations
  against (B3 in `before/bottlenecks.md`, and virtualization later).
- **Requirement:** SRS 5.3-a, 5.3-c, Phase 10. The query stays bounded at 2,000 rows; any other size stays ≤ 50.
- **Result (measured on :3101 dev and :4100):**
  - `GET /admin/users?pageSize=2000`: 1,507 users, 446 kB JSON, about 42 ms.
  - Headless Chrome: switching to All rendered 1,507 rows in 485 ms, including the fetch.
- **Verified by:**
  - backend `tsc`, unit tests, and `test/admin-users.e2e-spec.ts` (10/10: 2000 accepted; 51, 500 and 2001
    rejected);
  - frontend `tsc` and eslint;
  - a browser check on :3101.

## 2026-11-07: Reports moved into the frontend repository (tooling, no optimization)

- **Type:** tooling. No application code changed.
- **What:** the reports and this changelog moved from the monorepo's `document/perf-reports/` to
  `frontend/docs/performance/`. Before, they were in none of the three repositories.
- **What else:**
  - `scripts/perf/bundle-report.sh` now writes to `docs/performance/<label>/`.
  - `bundle-analyzer/` (~31 MB per report) is git-ignored (`/docs/performance/*/bundle-analyzer/`).
  - `before/README.md` explains how to rebuild it from the `perf-baseline` tag.
  - The Profiler exports are named by page.
- **Files:** `.gitignore`, `scripts/perf/bundle-report.sh`, `docs/performance/**`.
- **Why:** to version the reports with the code they measure.
- **Requirement:** SRS 5.3-c.

## 2026-11-07: Bottleneck analysis of the baseline (measurement, no optimization)

- **Type:** measurement. No code changed.
- **What:** `before/bottlenecks.md` summarizes the Lighthouse Desktop reports, the bundle report and the React
  Profiler exports in `before/profiler/` (`admin.json`, `users.json`, `audit.json`, `finance.json`). It plans
  B1–B6: zod on admin routes, duplicated admin chunks, re-rendering on every keystroke, duplicated lucide icons,
  the finance what-if input, and the dashboard charts.
- **Why:** to fix the order and the expected effect of the optimizations before any code is touched.
- **Requirement:** SRS 5.3-a, 5.3-c, Phase 10.
- **Result (baseline):**
  - Lighthouse 100 on /admin, /admin/users and /admin/finance; TBT 0 ms everywhere.
  - Admin First Load JS 675.7–708.2 kB.
  - Slowest Profiler commits: /admin 95.5 ms (24.4 ms on the second period change), users 20.0 ms,
    audit 13.9 ms, finance 6.3 ms.

## 2026-11-07: Frontend bundle baseline (measurement, no optimization)

- **Type:** measurement. No code or configuration changed (no analyzer package installed, `next.config.ts` untouched).
- **What:** production build + Next's built-in Turbopack analyzer (`next analyze -o --snapshot before`); report in
  `docs/performance/before/` (`build-sizes.txt` first).
- **Why:** a "before" reference for any bundle optimization (SRS 5.3-c: measured budgets, not claimed scores).
- **Requirement:** SRS 5.3-c, Phase 10.
- **Result (baseline):** shared by all 60 routes 530.6 kB raw / 162.6 kB gzip. Largest First Load JS:
  `/admin/moderation` 708.2 kB / 217.2 kB gzip; all 22 admin routes ≥ 675 kB; `/login` 658 kB; public pages
  535–540 kB. Largest third-party client dependencies: react-dom 202.6 kB (all routes), zod 102.0 kB (29 routes,
  incl. login/register/admin), lucide-react 30.4 kB unique / 51.4 kB across chunks (all routes); Next's own
  runtime is 312.8 kB.
- **Verified by:** chunk sums equal Next's `firstLoadUncompressedJsBytes` for 60/60 routes.

## 2026-11-07: Permanent local performance-testing stack (tooling, no optimization)

- **Type:** tooling. No application or optimization code was changed.
- **What:** a local stack that runs beside the everyday dev stack: PostgreSQL 17 in Docker (127.0.0.1:5455, named
  volume `fixeditnow_perf_pg`, restart policy `unless-stopped`), the API compiled to `dist-perf/` on :4100, and a
  production build of the web app on :3100 that proxies `/api/v1` to :4100. Step-by-step commands:
  `backend/docs/PERFORMANCE.md`.
- **Files:** `backend/docker-compose.perf.yml`, `backend/.env.perf.example` (+ git-ignored `backend/.env.perf` with
  locally generated secrets), `frontend/.env.perf.example` (+ `frontend/.env.perf`), `backend/package.json`
  (`perf:db:up|down|migrate|seed`, `perf:build`, `perf:start`; `perf:seed` / `perf:clean` now load `.env.perf`),
  `frontend/package.json` (`build:perf`, `start:perf`), both `.gitignore` files (`!.env.perf.example`,
  `/dist-perf`), `backend/docs/PERFORMANCE.md`.
- **Why:** measurements need real PostgreSQL concurrency and production builds. `npx prisma dev` (Prisma 7.10,
  PGlite) was tried first and rejected: 10 parallel queries took 485 ms vs 48 ms, and an open transaction blocked
  every other connection for more than 5 s. A dev-mode Next.js server is not representative either.
- **Requirement:** prerequisite for SRS 5.3-c and Phase 10.
- **Verified by:** migrations, reference seed, demo seed and perf seed applied to the Docker DB; API health 200 on
  :4100 and via the :3100 proxy; built-in admin sign-in, `GET /admin/finance/summary` over 60 Dhaka days gave
  60/60 days with money; Demo Admin switched on through the audited `PUT /admin/settings/demo.admin.*`, and
  `/demo/admin` sign-in works (it sees the 11 demo users only, by design); data still present after
  `docker restart`; the dev stack on :3000/:4000 kept answering 200 and `backend/dist/` was not modified.

## 2026-11-07: Performance seed and clean scripts (baseline tooling, no optimization)

- **Type:** tooling. No application or optimization code was changed.
- **What:** added a volume seed that fills a local database with realistic fake data, and a script that removes
  exactly that data again. Default run: 1,500 users (customers, professionals, both), 1,500 bookings in all 10
  statuses, 2,000 audit log entries, and 60 days of bKash sandbox payments (successful, failed, cancelled, expired,
  open, partially/fully refunded) so Admin > Financial reports draws a chart for every day.
- **Files:**
  - `backend/scripts/seed-perf.ts` (new): the seed (`npm run perf:seed`, options `--users= --bookings= --audit= --days= --seed=`)
  - `backend/scripts/clean-perf.ts` (new): the cleanup (`npm run perf:clean`, options `--dry-run --keep-audit --rechain`)
  - `backend/scripts/perf-common.ts` (new): markers and the database safety guard shared by both
  - `backend/package.json`, `backend/package-lock.json`: `@faker-js/faker` ^10.6.0 (devDependency), `perf:seed` / `perf:clean` scripts
- **Markers:** user email `@perf-seed.fixeditnow.test`; booking / payment / refund `idempotencyKey` starting with
  `perf-seed:`; audit entry `metadata.perfSeed = "perf-seed"`. Everything else (profiles, services, availability,
  quotes, booking events, disputes) hangs off a marked user or booking. Ids stay ordinary UUIDv7 and payment
  references keep the `FIN` + 24 hex format, because the API's `ParseUUIDPipe` / `ReferencePipe` reject anything else.
- **Why:** optimizations must be measured on realistic volume (SRS 5.3-c); with the reference seed alone the list,
  table, search and chart screens hold a handful of rows and every query looks fast.
- **Requirement:** prerequisite for SRS 5.3-a, 5.3-c and Phase 10 (it makes the measurements possible; it does not
  satisfy them by itself).
- **Safety:**
  - Both scripts refuse a non-local database host unless `--allow-remote` is given, and refuse `NODE_ENV=production`
    unless `--allow-production` is given. `backend/.env` points at a remote database, so always set `DATABASE_URL`
    to a local one first.
  - The seed refuses to run twice; it writes in one transaction.
  - The clean script also runs in one transaction. It stops (changes nothing) if a real booking or payment involves a
    seeded user.
  - `audit_log`, `payment_event` and `chat_message` are append-only. Only for the seeded rows, the clean script
    switches their guard triggers off inside the transaction and back on before commit. Audit entries written after
    the seed need `--rechain`: it renumbers and re-hashes the later rows, so use it on test databases only.
- **Result (local PostgreSQL 18, default sizes):** seed 2.0 s; 1,506 users (incl. 6 perf admin actors with no
  password), 1,500 bookings, 5,780 booking events, 214 quotes, 87 disputes, 653 payments, 51 refunds, 2,000 audit
  entries. `FinanceService.summary` over the last 60 Bangladesh days returned money collected on **60/60** days and
  refunds on 31 days.
- **Verified by:** `tsc --noEmit` and `oxlint` (clean); audit hash chain valid after seed and after every clean;
  SQL checks for no future timestamps and consistent ordering (created < confirmed < start, completion after
  work, COMPLETED bookings always paid); clean tested for: empty base, real data before the seed (preserved),
  a real audit row after the seed (refused, then `--rechain` → chain valid), an event on a seeded payment and a chat
  message on a seeded booking (removed), a real booking on a seeded professional (refused), `--dry-run`
  (rolled back), `--keep-audit`, and the remote-host / production guards. Guard triggers were confirmed re-enabled
  afterwards.
- **Not done:** no measurement of any page yet; nothing was run against the remote database.
