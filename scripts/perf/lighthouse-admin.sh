#!/usr/bin/env bash
# Lighthouse (Desktop) of /admin, /admin/users and /admin/finance on the production perf web app (:3100), signed in
# as the built-in administrator. Same Lighthouse version as the baseline (13.5.0).
#
#   cd frontend && bash scripts/perf/lighthouse-admin.sh after      # -> docs/performance/after/lighthouse/
#
# It signs in through :3100 and passes the session cookie to Lighthouse (--extra-headers). Lighthouse writes those
# headers into its reports, so the token is replaced with "[redacted]" in every report, and the session is signed
# out at the end. Reports with the same name are overwritten. Needs: npm run start:perf running,
# /usr/bin/google-chrome (or CHROME_PATH), python3.
set -euo pipefail
label="${1:?usage: bash scripts/perf/lighthouse-admin.sh <label>}"
cd "$(dirname "$0")/../.."
out="docs/performance/$label/lighthouse"
base="http://localhost:3100"
work="$(mktemp -d)"
trap 'rm -f "$work/jar" "$work/headers.json"; rmdir "$work"' EXIT
mkdir -p "$out"

code=$(curl -s -c "$work/jar" -o /dev/null -w '%{http_code}' -H "Origin: $base" -H 'Content-Type: application/json' \
  -d '{"email":"admin@rentnest.com","password":"admin123"}' "$base/api/v1/auth/sign-in/email")
[[ "$code" == 200 ]] || { echo "sign-in failed ($code): is npm run start:perf running?"; exit 1; }
cookie=$(awk '$6 ~ /session_token/ {print $6"="$7}' "$work/jar")
token="${cookie#*=}"
printf '{"Cookie":"%s"}' "$cookie" > "$work/headers.json"

for page in admin admin/users admin/finance; do
  name="localhost_3100-${page//\//_}"
  echo "lighthouse /$page"
  CHROME_PATH="${CHROME_PATH:-/usr/bin/google-chrome}" npx -y lighthouse@13.5.0 "$base/$page" --preset=desktop \
    --only-categories=performance --extra-headers="$work/headers.json" --chrome-flags="--headless=new --no-sandbox" \
    --output=html --output=json --output-path="$out/$name" --quiet
done

TOKEN="$token" OUT="$out" python3 -I - <<'PY'
import glob, os, urllib.parse
tok = os.environ["TOKEN"]; forms = {tok, urllib.parse.unquote(tok)}
forms |= {f.replace("/", "\\/") for f in forms}
paths = glob.glob(os.path.join(os.environ["OUT"], "*.report.*"))
for path in paths:
    text = open(path, encoding="utf-8").read()
    for f in forms:
        text = text.replace(f, "[redacted]")
    open(path, "w", encoding="utf-8").write(text)
left = sum(open(p, encoding="utf-8").read().count(urllib.parse.unquote(tok)[:24]) for p in paths)
print("session token occurrences left in the reports:", left)
PY
curl -s -b "$work/jar" -o /dev/null -X POST -H "Origin: $base" -H 'Content-Type: application/json' -d '{}' "$base/api/v1/auth/sign-out"
echo "done: $out"
