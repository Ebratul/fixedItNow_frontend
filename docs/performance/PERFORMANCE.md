# FixedItNow: Performance report (draft)

> Draft. Fill in the parts marked **TODO** before submitting.

| | |
| --- | --- |
| Project | **FixedItNow**, a home-services marketplace with customer, worker and admin areas |
| Stack | Next.js 16.4 (App Router, Turbopack, Cache Components, React Compiler), React 19.3, NestJS 12 API, PostgreSQL / Prisma 7 |
| Live URL | **TODO**: `https://…` |
| Repositories | frontend: github.com/Ebratul/fixedItNow_frontend, backend: github.com/Ebratul/fixedItNow_Backend |
| Baseline | git tag `perf-baseline` in both repositories; reports in `docs/performance/before/` |
| Scope | The admin panel: dashboard, users, audit log, finance. These pages have the largest lists, tables and charts. |

All numbers were measured on a local performance stack (`backend/docs/PERFORMANCE.md`), not on the live site:

- Docker PostgreSQL, the API on :4100, the production web build on :3100, the dev build on :3101;
- seeded data: 1,507 users, 1,500 bookings, 2,003 audit entries, 60 days of payments (`npm run perf:seed`);
- signed in as the built-in administrator.

Every change, with its files and measurements, is in `CHANGELOG.md`. The full before/after tables are in
`comparison.md`.

## 1. Bottlenecks found

The baseline analysis is `before/bottlenecks.md`. It used Lighthouse, the bundle analyzer and the React Profiler.

1. **zod on every admin route.** The admin log-in form, which a signed-in admin never sees, was imported
   statically. That put zod (102.8 kB raw / 29.3 kB gzip) into the first load of all 22 admin routes, and
   Lighthouse flagged 24 KiB of it as unused.
2. **Large lists rendered in full.** With every row shown, /admin/users mounted 1,507 rows (17,336 DOM nodes) and
   /admin/audit 2,003 entries (28,527 nodes). Each audit entry ran `JSON.stringify` on its metadata even while
   closed. The result was long tasks of 150–300 ms.
3. **Typing re-rendered more than the input.** This affected the finance what-if rate (the whole commission
   report) and, in principle, the users filters. Searches were debounced but never cancelled.
4. **Dashboard charts.** Every period change re-rendered three charts, each with a hidden table of one row per
   day. The 90-day setting cost about 50 ms per commit.
5. **Bundle structure.** Admin code is duplicated across route chunks (B2, still open). lucide icons were also
   duplicated across chunks.

## 2. Optimizations

| # | What | Where (frontend unless noted) | Why | Result |
| --- | --- | --- | --- | --- |
| 0 | "All (1000+)" / "All (2000+)" page sizes as a stress setting; the API accepts exactly 2000 / 5000 above the normal maximum (still bounded) | `people/users-list.tsx`, `people/audit-view.tsx`; backend `admin/users/users.controller.ts`, `admin/audit/audit.controller.ts` | A realistic large-list baseline | Baseline in `before/audit-all.md` |
| 1 | Virtualized users table and audit list (TanStack Virtual, overscan 10); audit metadata rendered only for open entries | `kit/use-virtual-rows.ts`, `kit/virtual-data-table.tsx`, `people/audit-view.tsx` | Bottleneck 2 | Render after the response 388–403 → 61–71 ms (users) and 457 → 62 ms (audit); DOM 17,336 → 669 and 28,527 → 667 nodes; no long tasks |
| 2 | AbortController for every API read; the 300 ms search debounce kept | `lib/api.ts`, `lib/use-api.ts` | Bottleneck 3 | 6 keys: 6 requests without debounce → 1. Slow network: 2 of 3 superseded requests aborted |
| 3 | Users filter form as its own component (state colocation) | `people/users-list.tsx` | Bottleneck 3 | Keystroke commits ≈ 1 ms (the React Compiler already skipped the table) |
| 4 | What-if commission rate: own state + 400 ms debounce | `ops/finance-view.tsx` | Bottleneck 3 | Slowest keystroke commit 3.1–4.6 → 0.6–0.7 ms |
| 5 | Scroll-linked UI (header shadow, "Rows a–b of N"): rAF throttle, scroll position in a ref; TanStack `useFlushSync: false`; the keyboard-focused row kept inside the window | `kit/use-virtual-rows.ts` | Scroll cost | Commits during a 150-event scroll: 142 → 31 (users), 114 → 31 (audit) |
| 6 | Chart table rendered only when open; chart lazy-loaded with `next/dynamic` behind an equal-height (250 px) skeleton | `dashboard/bar-chart.tsx`, `dashboard/lazy-bar-chart.tsx` | Bottleneck 4 | 90-day change 49–53 → 17–18 ms; the skeleton swap causes no layout shift |
| 7 | Admin log-in form lazy-loaded | `shell/admin-shell.tsx` | Bottleneck 1 | zod left all 22 admin routes: about −104 kB raw / −30 kB gzip each |
| 8 | Server Components: dashboard figures, "Needs attention", money, recent activity; user detail facts, counts, recent actions | `app/admin/page.tsx`, `app/admin/users/[id]/page.tsx`, `dashboard/dashboard-*.tsx`, `people/user-detail-*.tsx`, `lib/server-admin-api.ts` | Less client JavaScript; data read on the server | /admin −121.7 kB, /admin/users/[id] −123.7 kB First Load JS; the browser makes no dashboard API call |
| 9 | lucide imports and unused packages checked | `scripts/perf/duplicated_modules.py` | Bottleneck 5 | No change needed: imports already per icon; no unused package |
| 10 | Finance summary skeleton reserves the real height | `ops/finance-view.tsx` | CLS 0.153 found in the after run | CLS 0.153 → 0.027; Lighthouse 94 → 100 |

## 3. Lighthouse (Desktop, before → after)

| Page | Performance | LCP | TBT | CLS | JS before load |
| --- | --- | --- | --- | --- | --- |
| /admin | 100 → 100 | 0.62 → 0.78 s | 0 → 0 ms | 0.020 → 0.027 | 220 → 183 KiB |
| /admin/users | 100 → 100 | 0.67 → 0.67 s | 0 → 0 ms | 0.000 → 0.027 | 221 → 203 KiB |
| /admin/finance | 100 → 100 | 0.78 → 0.71 s | 0 → 0 ms | 0.001 → 0.027 | 223 → 192 KiB |

Reports: `before/screenshots/localhost_3100-*.html` and `after/lighthouse/*.report.html`.

- "Before" was run from Chrome DevTools. "After" was run with the Lighthouse 13.5.0 CLI, same Desktop preset
  (`scripts/perf/lighthouse-admin.sh`).
- The CLI's "total size" also counts Next's link prefetches, which is why it rose. "JS before load" is the
  comparable number.
- See `comparison.md` §1 for the details, including the reason for /admin's +0.16 s LCP.

## 4. Bundle (First Load JS, before → after)

| Route | Raw | Gzip |
| --- | --- | --- |
| /admin | 677.7 → **556.0 kB** | 208.1 → **172.4 kB** |
| /admin/users | 678.5 → **613.5 kB** | 209.0 → **190.8 kB** |
| /admin/users/[id] | 695.8 → **572.1 kB** | 214.3 → **177.7 kB** |
| /admin/finance | 686.5 → **583.0 kB** | 210.9 → **181.1 kB** |
| /admin/audit | 687.7 → **621.2 kB** | 211.9 → **193.3 kB** |
| All 22 admin routes | 675.7–708.2 → **556.0–621.2 kB** | 207.7–217.2 → **172.4–193.3 kB** |

The same method was used for both reports: `bash scripts/perf/bundle-report.sh <label>` (`before/README.md`). The
analyzer folders are not in git and can be rebuilt.

## 5. React Profiler

**TODO: add screenshots** (React DevTools > Profiler, dev build on :3101). The baseline screenshots are in
`before/screenshots/`, and the profile files in `before/profiler/`.

| Interaction | Before (screenshot) | After (screenshot) |
| --- | --- | --- |
| /admin/users: switch to "All (1000+)" | **TODO** | **TODO** |
| /admin/users: type in the search box with All shown | `before/screenshots/1794060991268_image.png` (20 per page) | **TODO** |
| /admin/audit: switch to "All (2000+)" | **TODO** | **TODO** |
| /admin/finance: type a what-if rate | `before/screenshots/Pasted image.png` | **TODO** |
| /admin: change the period to 90 days | `before/screenshots/Pasted image (2).png` | **TODO** |

To get a "before" profile of the users table without virtualization, set `VIRTUALIZE_ABOVE = Infinity` in
`users-list.tsx` temporarily. The headless equivalents of these profiles, `scripts/perf/profile-*.mjs`, are in §2
and in `comparison.md` §3.

## 6. Core Web Vitals

| Metric | Threshold ("good") | Before (worst admin page) | After (worst admin page) |
| --- | --- | --- | --- |
| LCP, Largest Contentful Paint | ≤ 2.5 s | 0.78 s | 0.78 s |
| CLS, Cumulative Layout Shift | ≤ 0.1 | 0.020 | 0.027 (0.153 before fix 10) |
| INP, Interaction to Next Paint | ≤ 200 ms | Long tasks of 212–297 ms when a long list renders | No long tasks on the same interactions; slowest key event 24 ms |
| TBT (lab proxy for INP) | ≤ 200 ms | 0 ms | 0 ms |

- **These are lab numbers:** Lighthouse, plus headless Event Timing and long-task observers. There is no field data
  (CrUX/RUM) from real users yet. **TODO:** add field data from the live URL if available, for example Vercel Speed
  Insights.

## 7. Server / Client boundary

```
app/admin/layout.tsx         Server: <Suspense> around the client shell
└─ AdminShell                Client: /me check, sign-in form (lazy), sidebar, permission context
   └─ app/admin/page.tsx     Server: reads ?days=
      └─ DashboardFrame      Client: page frame, permission check, period <select> (transition + useOptimistic)
         └─ <Suspense fallback=DashboardSkeleton>
            └─ DashboardSummary   Server (async): serverAdminApi("/admin/dashboard?days=N")
               └─ DashboardBody   Server: stat cards, Needs attention, money, recent activity (HTML, no JS)
                  └─ LazyBarChart Client: next/dynamic chunk (hover state, table toggle)

app/admin/users/[id]/page.tsx  Server
└─ AdminPage                   Client: title, permission check
   └─ <Suspense> UserDetail    Server (async): serverAdminApi("/admin/users/:id"), notFound() for unknown ids
      ├─ UserFacts, UserActivity, RecentActions   Server
      └─ UserAccountActions                      Client: suspension + role <select>; router.refresh() after a change
```

- **What runs on the server:** read-only figures and lists. They have no state and no event handlers, so their
  code never reaches the browser, and the server reads the data while it streams the page.
- **What stays on the client:** everything a user interacts with: the period select, chart hover and the table
  toggle, the suspension dialog and the role select, the permission context, and the session check.
- **Security:** `lib/server-admin-api.ts` forwards only the visitor's Better Auth session cookie, with `no-store`.
  The API applies the same authentication, permission and realm checks as for a browser request. A failure comes
  back as a status: 401 renders nothing, 403 shows a message, and 404 gives `notFound()`.
- **Pitfalls met:**
  - Values exported from a `"use client"` module reach the server only as client references, so the period
    constants live in a plain module.
  - `next/dynamic` code-splits only when it is called from a Client Component, so `LazyBarChart` has its own
    client module.
  - A function cannot be passed from a Server Component to a Client Component, so `BarChart` takes
    `unit: "count" | "bdt"` instead of a `format` function.

## 8. Limitations

- **Local lab measurements only.** No live-site or field data yet (TODO above). Most interaction numbers are from the
  React dev build; production is faster, but the before/after ratios are what count.
- **Mixed Lighthouse methods.** The before runs came from DevTools, the after runs from the CLI. Scores and timings
  are comparable; "total size" is not.
- **The client shell still gates the admin pages.** `AdminShell` checks `/me` on the client before it shows any
  admin page. So the server-rendered figures are in the RSC payload at once, but they appear only after that check.
  Moving the session check to the server is the next step.
- **B2 is open.** Admin code is still duplicated across route chunks (498 kB in chunks vs 302 kB unique).
- **"All" is a stress setting.** It is bounded at 2,000 / 5,000 rows on the server, and it is not a substitute for
  pagination at real scale.
- **Site header CLS 0.027** comes from the public site header nav, outside the admin code, and is not fixed.
- **Keyboard and virtualization:** the window follows keyboard focus, but a row scrolled far away with the mouse is
  unmounted, along with any focus inside it.
