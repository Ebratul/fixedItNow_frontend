# /admin/audit with "All (2000+)": before virtualization

Measured 2026-11-07 on the dev perf app (:3101, dev-mode React), headless Chrome 1440×900, signed in as
admin@rentnest.com, perf seed with 2,003 audit entries. This is commit "All (2000+)" (pageSize 5000), before any audit
optimization. Method: `node scripts/perf/measure-list.mjs /admin/audit audit-page-size 5000 "ul.divide-y > li" audit-target-id 3`.

| Run | Switch to All, total | Fetch | Render after response | Items in DOM | DOM nodes (page) | Long tasks on switch | Slowest key event while typing | Long tasks while typing |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 598 ms | 75 ms | 523 ms | 2,003 | 28,527 | 297 + 190 ms | 16 ms | 77 ms |
| 2 | 517 ms | 61 ms | 457 ms | 2,003 | 28,527 | 241 + 173 ms | 24 ms | 86 ms |
| 3 | 487 ms | 58 ms | 429 ms | 2,003 | 28,527 | 228 + 165 ms | 24 ms | 76 ms |
| **Median** | **517 ms** | 61 ms | **457 ms** | **2,003** | **28,527** | **241 + 173 ms** | 24 ms | 77 ms |

- **Switch to All, total:** from the select change until two frames after the list is shown.
- **Render after response:** the part spent in the browser after the API answered, which is what virtualization
  targets.
- **Typing:** 6 characters into "Target id", 60 ms apart. Event Timing entries of 16 ms or more are recorded, plus
  long tasks (> 50 ms) in the same window.

Why it is slow:

- Every one of the 2,003 entries is mounted: a `<details>` with its summary, its hidden body, and
  `JSON.stringify(metadata, null, 2)` in a `<pre>`, even while the entry is closed.
- About 14 DOM nodes per entry.
- Any state change in `AuditView` (a keystroke in a filter, the result arriving) re-renders all of them.
