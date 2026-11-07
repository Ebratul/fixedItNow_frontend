# Baseline (before optimizations)

Captured 2026-11-07 with no code changes, on the local perf stack (`backend/docs/PERFORMANCE.md` in the backend repo).
Next.js 16.4.3 (Turbopack), production build via `npm run build:perf` (`next build` with `.env.perf`; that file only
sets the `/api/v1` proxy target, which is not part of any client bundle). The findings are in `bottlenecks.md`.

| File | What it is |
| --- | --- |
| `bottlenecks.md` | **Read this first.** The measured bottlenecks (Lighthouse, bundle, Profiler) and the planned fixes. |
| `build-sizes.txt` | First Load JS of every route (raw and gzip), the 10 largest JS chunks with what is inside them, and client JS per dependency. |
| `dependencies.json` | The dependency table in machine-readable form, including which routes contain each package. |
| `route-bundle-stats.json` | Next's own per-route data from this build (`.next/diagnostics/route-bundle-stats.json`): uncompressed First Load JS and the chunk list. |
| `next-build-output.txt` | Console output of the build (route list, static / partial prerender markers). |
| `analyzer-graph.jsonl.gz` | `next analyze export --snapshot before`: every module, chunk and route of the analysis as JSON Lines. |
| `bundle-analyzer/` | Next's built-in bundle analyzer, static files (~31 MB). **Not in git** (`.gitignore`); rebuild it as described below. |
| `profiler/` | React DevTools Profiler exports (dev mode, :3101): `users.json`, `audit.json`, `finance.json`, `admin.json`. Open them in React DevTools > Profiler > Load profile. |
| `screenshots/` | Lighthouse Desktop HTML reports for /admin, /admin/users and /admin/finance (`localhost_3100-*.html`) and Profiler screenshots. |

## Opening the analyzer

The analyzer pages use absolute `/_next/...` paths, so serve the folder as a site root:

```bash
cd frontend      # the repository root of fixedItNow_frontend
python3 -m http.server 8091 -b 127.0.0.1 -d docs/performance/before/bundle-analyzer
# open http://127.0.0.1:8091/analyze.html
```

Or open the analyzer live on the current code: `npx next analyze` (interactive UI; a saved snapshot can be compared
from its Compare tab).

## Rebuilding `bundle-analyzer/` (it is not committed)

The `before` analyzer must be built from the baseline code, which is the commit tagged `perf-baseline`. Build it in a
separate worktree so your working copy is untouched. In the monorepo the same commit is the local tag
`frontend/perf-baseline`.

```bash
# stop the perf web app on :3100 first (the script refuses to run while :3100 is in use)
cd frontend
git worktree add ../frontend-perf-baseline perf-baseline     # monorepo: ... frontend/perf-baseline
cp .env.perf ../frontend-perf-baseline/.env.perf
cd ../frontend-perf-baseline && npm ci
bash scripts/perf/bundle-report.sh before /tmp/perf-before   # full report into /tmp, nothing here is overwritten
cd - && cp -r /tmp/perf-before/bundle-analyzer docs/performance/before/
git worktree remove ../frontend-perf-baseline
```

Every number in the committed files comes from `build-sizes.txt` and `analyzer-graph.jsonl.gz`, so the analyzer is only
needed to browse the bundle visually. A rebuild's `build-sizes.txt` sections 1–3 should equal the committed one
(the method was checked to be reproducible).

## Making the "after" report (same method)

The report is produced by `scripts/perf/bundle-report.sh` (steps) and `scripts/perf/bundle_report.py`
(the numbers). It changes no source file. Needs node/npm, python3 and gzip.

```bash
# 1. stop the perf web app if it is running (Ctrl+C in its terminal): the build replaces .next under it
# 2. generate the report
cd frontend
bash scripts/perf/bundle-report.sh after        # writes docs/performance/after/
# 3. start the perf web app again
npm run start:perf
# 4. compare
diff docs/performance/{before,after}/build-sizes.txt
```

- Any label works (`after`, `after-zod`, ...): it names the output folder and the analyzer snapshot. A label whose
  folder already has a report is refused (`FORCE=1` overwrites). This `before/` folder is protected the same way.
- Optional second argument: a different output folder, e.g. `bash scripts/perf/bundle-report.sh after /tmp/check`.
- The script refuses to run while something listens on :3100, and needs `.env.perf`.
- `bundle-analyzer/` of every report is git-ignored (`/docs/performance/*/bundle-analyzer/`); commit the rest.
- The analyzer's Compare tab (`npx next analyze`) can show the `before` and `after` snapshots side by side.

What the script does, in order: `npm run build:perf` → `next analyze -o --snapshot <label>` →
`next analyze export --snapshot <label>` → `bundle_report.py` → copies `route-bundle-stats.json`, the build output,
the analyzer folder and the graph export into the report folder.

## How the numbers are produced

- First Load JS and chunk sizes come from the real build (`.next/static/chunks`). gzip = gzip -9 per file.
- What a chunk contains, and the dependency table, come from the analyzer graph. The analyzer compiles the app
  itself, so its chunk files have different hashes; they are matched to the build's chunks by size (same source,
  65/66 matched within 3 %, the largest ones within 0.5 %).
- Reproducibility was checked: a second full run of the script (fresh build + analysis) gave sections 1-3
  identical to this report.
