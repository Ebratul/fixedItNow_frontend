# Search requests while typing: /admin/users and /admin/bookings

Measured 2026-11-07 on the dev perf app (:3101), headless Chrome, signed in as admin@rentnest.com.
The search text is "rahman" (6 keys). Method: `node scripts/perf/count-search-requests.mjs <page> <input id> <api path> rahman`.

The two scenarios:

- **Fast typing:** 80 ms between keys, normal latency.
- **Slow network:** 600 ms added latency (Chrome DevTools Protocol) and a 350 ms pause after every 2 keys. A
  debounced request can still be in flight when the next one starts.

| Page | Scenario | No debounce (delay 0, measured by switching it off temporarily) | 300 ms debounce, no AbortController (before) | 300 ms debounce + AbortController (after) |
| --- | --- | --- | --- | --- |
| /admin/users | fast typing | 6 sent, 6 completed | 1 sent, 1 completed | 1 sent, 1 completed |
| /admin/users | slow network | 6 sent, 6 completed | 3 sent, **3 completed** | 3 sent, **1 completed, 2 aborted** |
| /admin/bookings | fast typing | 6 sent, 6 completed | 1 sent, 1 completed | 1 sent, 1 completed |
| /admin/bookings | slow network | 6 sent, 6 completed | 3 sent, **3 completed** | 3 sent, **1 completed, 2 aborted** |

- **The 300 ms debounce was already in the code.** `useDebounced` defaults to 300 ms, and both search boxes use
  it. The "no debounce" column shows what it saves: 6 → 1 request for normal typing.
- **What is new is the AbortController** (`lib/api.ts`, `lib/use-api.ts`). When the next debounced query starts,
  the one still in flight is cancelled. The browser stops downloading it, and its late answer can never
  overwrite the newer one. On a slow network, 2 of the 3 requests are now aborted instead of completing for
  nothing.
