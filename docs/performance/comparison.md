# Before / after comparison

The baseline is `before/`, tag `perf-baseline`. "After" is the optimized code (`after/`). The individual changes
and their own measurements are in `CHANGELOG.md`.

Both sides use the same data, the local perf stack with the perf seed: 1,507 users, 1,500 bookings, 2,003 audit
entries and 60 days of payments. Signed in as admin@rentnest.com.

## 1. Lighthouse (Desktop, production build on :3100, signed in)

| Page | Metric | Before | After |
| --- | --- | --- | --- |
| /admin | Performance | 100 | 100 |
| | FCP / LCP | 0.22 s / 0.62 s | 0.25 s / 0.78 s |
| | TBT / CLS | 0 ms / 0.020 | 0 ms / 0.027 |
| | Speed Index | 0.23 s | 0.30 s |
| | JS loaded before the load event | 220 KiB | **183 KiB** |
| | Unused JS flagged | react-dom 25.6 KiB + **zod 24.1 KiB** | react-dom 22.8 KiB |
| /admin/users | Performance | 100 | 100 |
| | FCP / LCP | 0.22 s / 0.67 s | 0.21 s / 0.67 s |
| | TBT / CLS | 0 ms / 0.000 | 0 ms / 0.027 |
| | JS before load | 221 KiB | **203 KiB** |
| | Unused JS flagged | react-dom + **zod 24.1 KiB** | react-dom only |
| /admin/finance | Performance | 100 | 100 (94 before the CLS fix) |
| | FCP / LCP | 0.22 s / 0.78 s | 0.21 s / **0.71 s** |
| | TBT / CLS | 0 ms / 0.001 | 0 ms / 0.027 (was 0.153) |
| | JS before load | 223 KiB | **192 KiB** |
| | Unused JS flagged | react-dom + **zod 24.1 KiB** | react-dom only |

How to read it:

- **Not the same tool.** The "before" reports were run from Chrome DevTools. The "after" reports come from the
  Lighthouse 13.5.0 CLI (`scripts/perf/lighthouse-admin.sh`), headless, with the same Desktop preset.
- **"Total size" is not comparable.** After shows 565–678 KiB, before 307–490 KiB. The CLI waits for the network
  to go quiet, so it also records Next's link prefetches of the admin sidebar: 72–77 low-priority requests after,
  15–31 before. The fair number is the JS loaded before the load event, and it went down on all three pages.
- **The remaining CLS of 0.027** is the site header nav (`nav.hidden lg:flex`), the same on every page. It is
  outside the admin code and was 0.020 on /admin before.
- **/admin LCP +0.16 s.** The page now reads the dashboard on the server and streams it in the same response, so
  the document is bigger (9 → 18 KiB) and finishes later. It is still well inside "good" (≤ 2.5 s).

## 2. Bundle (`before/build-sizes.txt` vs `after/build-sizes.txt`)

First Load JS, raw / gzip:

| Route | Before | After | Change |
| --- | --- | --- | --- |
| /admin | 677.7 / 208.1 kB | **556.0 / 172.4 kB** | −121.7 / −35.7 |
| /admin/users | 678.5 / 209.0 kB | **613.5 / 190.8 kB** | −65.0 / −18.2 |
| /admin/users/[id] | 695.8 / 214.3 kB | **572.1 / 177.7 kB** | −123.7 / −36.6 |
| /admin/finance | 686.5 / 210.9 kB | **583.0 / 181.1 kB** | −103.5 / −29.8 |
| /admin/audit | 687.7 / 211.9 kB | **621.2 / 193.3 kB** | −66.5 / −18.6 |
| /admin/moderation (largest before) | 708.2 / 217.2 kB | **603.8 / 187.1 kB** | −104.4 / −30.1 |
| Every other admin route (16) | 675.7–699.8 kB | 571.3–595.5 kB | about −104 / −30 each |
| All 22 admin routes | **675.7–708.2 / 207.7–217.2 kB** | **556.0–621.2 / 172.4–193.3 kB** | −65 to −124 kB raw |
| Non-admin routes (38) | | unchanged | 0 |
| Shared by all 60 routes | 530.6 / 162.6 kB | 530.7 / 162.7 kB | 0 |

- **zod (102.8 kB raw / 29.3 kB gzip)** was in the first load of 29 routes and is now in 7: /login, /register,
  /verify-email, /forgot-password, /reset-password, /onboarding/customer and /onboarding/worker. Those are the forms
  that validate with it. It was on all 22 admin routes before and is on none now (lazy `AdminLogin`).
- **@tanstack/virtual-core (31.5 kB raw / 9.6 kB gzip)** is new, and only on /admin/users and /admin/audit. That
  is why those two save 65 kB instead of 104 kB.
- **/admin and /admin/users/[id]** save about 18–20 kB more than the rest: their figures, stat cards and lists are
  Server Components now.
- **lucide-react** is unchanged: 30.7 kB unique, 25 icons in more than one chunk, 21.6 kB of extra copies (was
  21.3). The imports were already per icon (CHANGELOG).
- **Admin code across chunks:** 508.7 → 498.0 kB, with 302 kB unique. B2 is still open (see limitations).

## 3. Rendering and interaction (React dev build on :3101, headless Chrome)

These are dev-mode numbers, so they are higher than in production; compare them side by side only. The scripts
are in `scripts/perf/`.

| Scenario | Before | After |
| --- | --- | --- |
| /admin/users, switch to "All (1000+)": render after the response | 388–403 ms | **61–71 ms** |
| /admin/users All: rows / DOM nodes on the page | 1,507 / 17,336 | **19 / 669** |
| /admin/users All: long tasks on the switch | 212 + 152 ms | **none** |
| /admin/audit, switch to "All (2000+)": render after the response (median) | 457 ms | **62 ms** |
| /admin/audit All: entries / DOM nodes | 2,003 / 28,527 | **20 / 667** |
| /admin/audit All: long tasks on the switch / while typing | 241 + 173 ms / 77 ms | **none / none** |
| Scroll sweep, 150 scroll events, React commits (users / audit) | 142 / 114 | **31 / 31** |
| Scroll sweep, total render time (users / audit) | 335–343 / 125–130 ms | **174–180 / 76–84 ms** |
| Search "rahman", requests sent: no debounce → 300 ms debounce | 6 | **1** |
| Search on a slow network: requests completed / aborted | 3 / 0 | **1 / 2** |
| /admin/finance what-if rate, slowest keystroke commit | 3.1–4.6 ms | **0.6–0.7 ms** |
| /admin dashboard, period change to 90 days, slowest commit | 49–53 ms | **17–18 ms** (20–22 ms after the move to Server Components) |
| /admin/users search, slowest keystroke commit | 1.1–1.4 ms | 0.8–1.2 ms |

## 4. Bottlenecks from `before/bottlenecks.md`

| | Bottleneck | Status |
| --- | --- | --- |
| B1 | zod on every admin route | **Fixed**: lazy `AdminLogin`. −104 kB raw / −30 kB gzip per admin route. |
| B2 | Admin code duplicated across route chunks | **Open**: 508.7 → 498.0 kB in chunks. Only incidental gains. |
| B3 | Keystroke re-renders the list | **Done**: filter form colocated, lists virtualized, debounce + AbortController. The React Compiler had already removed most keystroke cost. |
| B4 | lucide duplication | **No change needed**: the imports are already per icon; the duplication is chunking, about 1 kB per navigation. |
| B5 | Finance what-if input | **Fixed**: state colocation + 400 ms debounce. Keystroke commit ≈ 5× cheaper. |
| B6 | Dashboard charts | **Fixed**: hidden table only when open, lazy chart, equal-height skeleton. 90-day change ≈ 3× cheaper. |
| new | Finance CLS (found in the after run) | **Fixed**: the summary skeleton reserves the real height. CLS 0.153 → 0.027. |
