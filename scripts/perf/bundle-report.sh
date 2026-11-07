#!/usr/bin/env bash
# Frontend bundle report, produced the same way every time (document/perf-reports/before/README.md).
#
#   cd frontend
#   bash scripts/perf/bundle-report.sh after                 # -> ../document/perf-reports/after/
#   bash scripts/perf/bundle-report.sh after /some/other/dir # custom output folder
#   FORCE=1 bash scripts/perf/bundle-report.sh after         # overwrite an existing report
#
# Steps: 1) production build (npm run build:perf)  2) Next's built-in analyzer, saved as snapshot <label>
#        3) export of the analyzer graph  4) scripts/perf/bundle_report.py  5) copy everything into the report folder.
# Changes no source file. Needs: node/npm, python3, gzip. The build replaces .next, so stop `npm run start:perf` first.
set -euo pipefail

label="${1:?usage: bash scripts/perf/bundle-report.sh <label, e.g. after> [output dir]}"
[[ "$label" =~ ^[a-z0-9][a-z0-9_-]{0,40}$ ]] || { echo "label must be lowercase letters, digits, - or _"; exit 1; }

cd "$(dirname "$0")/../.."               # frontend/
front="$PWD"
out="${2:-$front/../document/perf-reports/$label}"

if [[ -f "$out/build-sizes.txt" && "${FORCE:-}" != "1" ]]; then
  echo "$out already has a report. Use another label, or FORCE=1 to overwrite it."
  exit 1
fi
if command -v ss >/dev/null && ss -ltn | grep -q ':3100 '; then
  echo "Something is listening on :3100 (npm run start:perf?). Stop it first: the build replaces .next under it."
  exit 1
fi
[[ -f .env.perf ]] || { echo "frontend/.env.perf is missing: cp .env.perf.example .env.perf"; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "1/5 production build (npm run build:perf)"
npm run build:perf >"$work/build.log" 2>&1 || { tail -40 "$work/build.log"; exit 1; }

echo "2/5 bundle analyzer (next analyze -o --snapshot $label)"
npx next analyze -o --snapshot "$label" >"$work/analyze.log" 2>&1 || { tail -40 "$work/analyze.log"; exit 1; }

echo "3/5 analyzer graph export"
npx next analyze export --snapshot "$label" >"$work/graph.jsonl"

echo "4/5 report"
mkdir -p "$out"
python3 -I scripts/perf/bundle_report.py "$front" "$work/graph.jsonl" "$out" "$label" >/dev/null

echo "5/5 copying artifacts to $out"
cp .next/diagnostics/route-bundle-stats.json "$out/route-bundle-stats.json"
sed 's/\x1b\[[0-9;]*m//g' "$work/build.log" >"$out/next-build-output.txt"
rm -rf "$out/bundle-analyzer" && cp -r .next/diagnostics/analyze "$out/bundle-analyzer"
gzip -9 -c "$work/graph.jsonl" >"$out/analyzer-graph.jsonl.gz"

echo
sed -n '1,/^== 1/p' "$out/build-sizes.txt" | sed '$d'
echo "Done: $out/build-sizes.txt   (restart the perf web app: npm run start:perf)"
