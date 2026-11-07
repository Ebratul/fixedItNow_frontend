# Performance bottlenecks: baseline (before any optimization)

Date: 2026-11-07. Stack: the local perf stack (`backend/docs/PERFORMANCE.md`) with the perf seed (about 1,500 users,
1,500 bookings, 2,000 audit entries and 60 days of payments), signed in as admin@rentnest.com. No code has been
optimized yet. Every number below comes from a file in this folder.

| Evidence | File(s) |
| --- | --- |
| Lighthouse, Desktop, http://localhost:3100 (production build) | `screenshots/localhost_3100-20261107T192315.html` (/admin), `…T193116.html` (/admin/users), `…T193218.html` (/admin/finance) |
| Bundle report | `build-sizes.txt`, `dependencies.json`, `route-bundle-stats.json`, `analyzer-graph.jsonl.gz` (`bundle-analyzer/` is not in git; see `README.md`) |
| React Profiler exports | `profiler/admin.json` (/admin), `profiler/users.json` (/admin/users), `profiler/finance.json` (/admin/finance), `profiler/audit.json` (/admin/audit) |
| Profiler screenshots | `screenshots/Pasted image (2).png` (/admin, commit 4/4), `screenshots/1794060991268_image.png` (/admin/users, commit 16/16), `screenshots/Pasted image.png` (/admin/finance, commit 1/5) |

## 1. Lighthouse (Desktop, localhost:3100)

| Page | Performance | FCP | LCP | TBT | CLS | Speed Index | Transferred | Unused JS |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /admin | 100 | 0.2 s | 0.6 s | 0 ms | 0.02 | 0.2 s | 490 KiB | ~50 KiB |
| /admin/users | 100 | 0.2 s | 0.7 s | 0 ms | 0 | 0.2 s | 307 KiB | ~49 KiB |
| /admin/finance | 100 | 0.2 s | 0.8 s | 0 ms | 0.001 | 0.2 s | 410 KiB | ~50 KiB |

Lighthouse 13.5.0, simulated throttling, desktop form factor. All three pages already score 100, and TBT is 0 ms on all
of them. The one opportunity Lighthouse reports on every page is the same unused JavaScript:

- `04s4mq42llu5y.js` (zod, 29.6 KiB transferred): **24.1 KiB unused**;
- `2ki52vdnbo2ft.js` (react-dom and the Next runtime, 70.4 KiB): about 25.5 KiB unused, which is framework code and
  not ours to remove.

Caveat: this is localhost on a fast desktop, so the network costs almost nothing. The same bytes on a mid-range phone
over 4G (Lighthouse Mobile) will cost noticeably more, so the bundle findings below still matter even at a score of 100.

## 2. Bundle (production build, `build-sizes.txt`)

- **First Load JS on the admin routes is 675.7–708.2 kB raw (207.7–217.2 kB gzip).** The smallest is /admin/system
  and the largest is /admin/moderation. Public pages load 530.6 kB, so each admin route adds 145–178 kB.
  /admin is 677.7 kB, /admin/users 678.5 kB, /admin/finance 686.5 kB and /admin/audit 687.7 kB.
- **zod: 102.8 kB raw / 29.3 kB gzip in one chunk, loaded on 29 routes, including all 22 admin routes.** Admin pages
  validate nothing with zod. It arrives through a static import chain:
  `components/admin/shell/admin-shell.tsx` imports `AdminLogin` (shown only to a signed-out visitor), which imports
  `lib/validation.ts`, which imports `zod`. That is why Lighthouse finds 24 KiB of it unused.
- **lucide-react: 30.4 kB of unique code but 51.4 kB summed over chunks, on all 60 routes.** The same icons are
  copied into several route chunks.
- **Admin app code (`src/components/admin`): 301.2 kB unique but 508.7 kB summed over chunks, on 22 routes.** About
  207 kB of admin kit and shell code is repeated across per-route chunks, so each route chunk is 42–52 kB.
- Framework (Next runtime 312.8 kB, react-dom 202.6 kB) is shared by every route and is not a target.

## 3. React Profiler (dev mode)

The profiles were recorded with the dev server (component names are not minified). Dev React is slower than the
production build, so read the numbers as relative costs, not as what users see.

| Page (file) | Commits | Total render | Slowest commit | What rendered in the slowest commit | Cause ("What caused this update?") |
| --- | --- | --- | --- | --- | --- |
| /admin (`admin.json`) | 4 | 124.2 ms | **#2: 95.5 ms**; #4: 24.4 ms | the 3 `BarChart`s: 27.9 + 27.6 + 27.1 ms self (7.2 + 5.2 + 5.0 ms in #4), `Body` 2.7 ms | DashboardView (all 4 commits) |
| /admin/users (`users.json`) | 16 | 82.5 ms | **#10: 20.0 ms**; the screenshot's #16 is 12.9 ms | DataTable 9.7 ms self (8.7 ms in #16), 20 rows ≈ 90 host elements | UsersList (all 16 commits) |
| /admin/audit (`audit.json`) | 15 | 69.9 ms | **#3: 13.9 ms**; next #4: 12.0 ms (Immediate) | #4: ApiView 8.1 ms self, AuditView 1.8 ms, the 25-entry list | AuditView (all 15 commits) |
| /admin/finance (`finance.json`) | 5 | 23.1 ms | **#3: 6.3 ms**; #1 6.2 ms, #2 4.9 ms | ApiView 3.5 ms, CommissionReport 1.2 ms, 4 StatCards, Alert | CommissionReport (all 5 commits) |

On /admin/users, every keystroke in the search box re-renders the whole table. `setQ` updates UsersList state. The
API call waits for the debounce (`useDebounced`, 300 ms), but the render does not: UsersList → ApiView → DataTable and
all 20 rows render again on each key (commits #4, #7, #10, #13 and #16 are 9–20 ms). The cost stays small only because
pagination shows 20 rows (`PAGE_SIZE = 20`). The page lists 1,500 users, and without pagination the same keystroke
would render 75 times as many rows.

/admin/audit has the same pattern: every keystroke in any of its 5 text filters re-renders all 25 `Entry` rows. Each
row runs `JSON.stringify(entry.metadata, null, 2)` even while its `<details>` is closed.

On /admin/finance, typing a what-if rate re-renders the whole commission report (Alert, Card, 4 StatCards). Every
commit is under 7 ms, so this is minor.

On /admin (`admin.json`), the recording was: change the period dropdown to 7 days, then to 30 days, then open
"Show as table". Each period change makes two commits:

1. An Immediate commit for the dropdown itself: #1 is 1.4 ms and #3 is 2.9 ms. Only `AdminPage`, `DashboardView` and
   `SelectInput` render. The old figures stay on screen, dimmed.
2. A Normal commit when the new data arrives: #2 (7 days) is **95.5 ms** and #4 (30 days) is 24.4 ms. This commit
   re-renders the whole `Body`, all three `BarChart`s and every `StatCard`.

In that commit, each `BarChart` renders two `<rect>`s per day. It also renders the full hidden "Show as table" table,
one row per day, even though the `<details>` is closed. Each day is a `<g>` with two `<rect>`s plus a table row (`tr`, `th`, `td`): 6 elements. At the 90-day setting that is
about 3 × 90 × 6 ≈ 1,600 elements per update.

Opening "Show as table" made no React commit. The `<details>` is native HTML, and the table was already in the DOM.
That is also why it costs every render: the hidden table is rendered every time.

The 7-day commit (95.5 ms) renders fewer bars than the 30-day one (24.4 ms). So most of its cost is not the bars.
It was the first re-render after the page loaded, and dev-mode React does extra one-time work there. Treat 24.4 ms
as the steady cost, and confirm the 95.5 ms in a profiling production build (`next build --profile`).

Not recorded: hovering a bar calls `setActive`, which re-renders the whole chart (every bar and the hidden table) on
each `mouseenter` and `mouseleave`. Record a hover sweep across the 90-day chart before fixing B6.

One older export on disk (`~/Downloads/profiling-data.11-07-2026.17-25-04.json`, not copied here) is the worker page
/account/availability (`AvailabilityEditor` → `Editor`). It has 22 commits, 314.9 ms in total, and its slowest commit
is 22.9 ms (Editor 10.6 ms self). It was recorded before the perf stack existed and is not used below.

## 4. Bottlenecks and planned fixes

Each fix will be measured with the same method (`README.md` here) and logged in `../CHANGELOG.md`. The requirement
IDs are the ones listed at the top of the changelog.

### B1. zod is shipped to every admin route (102.8 kB raw / 29.3 kB gzip, 24 KiB unused)

- **Why:** `admin-shell.tsx` imports `AdminLogin` statically, and its `loginSchema` pulls in all of zod. A signed-in
  administrator never sees that form.
- **Plan:**
  - Load `AdminLogin` with `next/dynamic` (or `React.lazy`) inside the `unauthenticated` branch, so zod becomes a
    lazy chunk for the 22 admin routes.
  - As a second step, check whether `lib/validation.ts` can use `zod/mini` for the public sign-in, registration and onboarding forms that keep it.
  - Server-side validation in the API is not affected.
- **Expected:** about −103 kB raw / −29 kB gzip First Load JS on every admin route, and the Lighthouse "unused
  JavaScript" item for the zod chunk disappears.
- **Requirement:** SRS 5.3-c (measured budgets: First Load JS per admin route), Phase 10.

### B2. Admin code is duplicated across route chunks (508.7 kB in chunks vs 301.2 kB unique)

- **Why:** each `/admin/*` page bundles its own copy of the shared admin kit (`components/admin/kit`, shell, ui
  primitives), so each route chunk carries 42–52 kB.
- **Plan:**
  - Confirm with the analyzer which modules repeat.
  - Make the shared admin kit and shell part of the admin layout's client boundary so Turbopack emits them once, as a
    shared chunk cached across admin navigations.
  - Lazy-load rarely used, heavy parts: the audit `VerifyPanel`, CSV export helpers, the finance chart and the
    moderation tools.
- **Expected:** "in chunks" for `src/components/admin` close to the 301 kB unique size, smaller per-route chunks, and
  faster client navigation between admin pages.
- **Requirement:** SRS 5.3-c, Phase 10.

### B3. Every keystroke re-renders the whole list (users: up to 20.0 ms per commit; audit: up to 13.9 ms)

- **Why:** the filter inputs' state lives in the same component as the results. Each key re-renders ApiView, the
  DataTable or audit list, and every row. The audit rows also re-run `JSON.stringify` on their metadata. Only
  pagination keeps it cheap.
- **Plan:**
  - Move each search or filter form into its own component, so typing re-renders only the input. Only the
    debounced value goes up to the list.
  - Wrap `DataTable` and `Entry` in `React.memo`, with stable props (a module-level `rowKey`).
  - Show the audit metadata only when its `<details>` is open.
  - Keep server-side pagination; the page sizes stay at 20 and 25.
- **Expected:** a keystroke commit renders the input only (under 1 ms in dev). The table renders once, when the
  debounced query returns new data.
- **Requirement:** SRS 5.3-a (large lists: the fix keeps the lists paginated and bounded), 5.3-c, Phase 10.

### B4. lucide-react icons are duplicated across chunks (51.4 kB in chunks vs 30.4 kB unique, 60 routes)

- **Why:** the icons used by the shared layout and the admin shell are also copied into individual route chunks.
- **Plan:**
  - Check that `optimizePackageImports` covers lucide-react (it is in Next's default list) and that every import is
    a named per-icon import.
  - Then import the shell and layout icons from one shared module, so they land in a shared chunk.
- **Expected:** about −20 kB raw summed over chunks. It is small, but it affects every route.
- **Requirement:** SRS 5.3-c, Phase 10.

### B5 (minor). The finance what-if rate input re-renders the whole commission report (6.3 ms max)

- **Plan:** fold it into the B3 change. Keep the rate input's text state in the input card, and pass only the
  debounced rate to the report. Do this only if it comes for free with B3.

### B6. Each dashboard data update re-renders all three charts (/admin: 24.4 ms steady, 95.5 ms first time)

- **Why:**
  - A period change re-renders `Body`, three `BarChart`s and every `StatCard`.
  - Each chart always renders its hidden "Show as table" table, as well as two `<rect>`s per day.
  - Hovering a bar sets state on the whole chart, so every bar renders again on each mouse move between bars.
- **Plan:**
  - Render the table only while its `<details>` is open (`onToggle` → state). The text stays available, because it
    renders as soon as the table is opened.
  - Split the bars into a memoized `Bars` component, so hover state re-renders only the caption and the highlighted
    bar. Alternatively, do the highlight in CSS (`:hover`) and keep the state only for the caption text.
  - Wrap `BarChart` in `React.memo`, so a chart whose points did not change is skipped.
- **Expected:** the 30-day data commit drops well below 24.4 ms in dev. Hover commits touch the caption only. Measure
  at the 7, 30 and 90-day settings, and with a hover sweep.
- **Requirement:** SRS 5.3-a (bounded rendering of large lists), 5.3-c, Phase 10.

## 5. What is not a bottleneck

- **The period dropdown itself:** its own commit is 1.4–2.9 ms, and the old figures stay visible, dimmed, while the new ones load.
- **TBT, CLS and LCP on desktop:** all within "good" (LCP ≤ 0.8 s, CLS ≤ 0.02, TBT 0 ms).
- **Server response:** the root document took 3–4 ms on all three pages.
- **The framework chunks:** react-dom and the Next runtime make up 530.6 kB on every route and are outside our
  control.
