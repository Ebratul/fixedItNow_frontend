"""Bundle size report from a Next.js 16 (Turbopack) production build + `next analyze export` graph.

Normally run through scripts/perf/bundle-report.sh, which does the build and the analysis first, so every report
(before / after) is produced the same way. Standard library only.

usage: python3 -I bundle_report.py <frontend dir> <graph.jsonl> <out dir> [label]
Writes <out>/build-sizes.txt and <out>/dependencies.json. <label> (default "before") names the snapshot in the text.

Method (keep it unchanged between reports, or the numbers are not comparable):
  - First Load JS per route and chunk sizes: the real build (.next/static/chunks, .next/diagnostics/route-bundle-stats.json);
    gzip = gzip -9 of each file.
  - Chunk contents and per-dependency sizes: the analyzer graph (`next analyze export`). The analyzer compiles the app
    itself, so its chunk names differ; chunks are matched to the build's by closest size (within 3 %).
"""
import collections, gzip, json, os, re, sys, datetime

front, graph_path, out = sys.argv[1:4]
label = sys.argv[4] if len(sys.argv) > 4 else "before"
chunks_dir = os.path.join(front, ".next/static/chunks")
stats = json.load(open(os.path.join(front, ".next/diagnostics/route-bundle-stats.json")))

def gz(path):
    with open(path, "rb") as f:
        return len(gzip.compress(f.read(), 9))

real = {}
for name in os.listdir(chunks_dir):
    p = os.path.join(chunks_dir, name)
    if os.path.isfile(p) and name.endswith(".js"):
        real[name] = (os.path.getsize(p), gz(p))

# ---- analyzer graph: client parts (deduplicated per chunk + module) ----
parts = {}
routes_of_pkg = collections.defaultdict(set)
chunk_modules = collections.defaultdict(collections.Counter)
analyzer_chunk_size = collections.Counter()

def package(source):
    s = source.replace("[project]/", "")
    if "node_modules/" in s:
        tail = s.rsplit("node_modules/", 1)[1].split("/")
        pkg = "/".join(tail[:2]) if tail[0].startswith("@") else tail[0]
        if pkg == "next":
            m = re.search(r"next/dist/compiled/((?:@[^/]+/)?[^/]+)", s)
            if m:
                return f"{m.group(1)} (bundled in next)"
            return "next (framework runtime)"
        return pkg
    if s.startswith("src/"):
        bits = s.split("/")
        return "app code: " + "/".join(bits[:3] if bits[1] in ("components", "app") else bits[:2])
    return "other: " + s.split("/")[0]

for line in open(graph_path):
    r = json.loads(line)
    if r.get("type") != "part" or "/static/chunks/" not in r["filename"] or not r["filename"].endswith(".js"):
        continue
    chunk = r["filename"].rsplit("/", 1)[1]
    pkg = package(r["source_path"])
    routes_of_pkg[pkg].add(r["route"])
    key = (chunk, r["source_path"])
    if key in parts:
        continue
    parts[key] = (r["size"], r["compressed_size"], pkg)
    analyzer_chunk_size[chunk] += r["size"]
    chunk_modules[chunk][pkg] += r["size"]

# unique = each module once (what the package costs); in_chunks = summed over every chunk that contains it (duplication).
pkg_size = collections.Counter(); pkg_gz = collections.Counter(); pkg_in_chunks = collections.Counter(); seen_mod = set()
for (_, src), (size, comp, pkg) in parts.items():
    pkg_in_chunks[pkg] += size
    if src in seen_mod:
        continue
    seen_mod.add(src)
    pkg_size[pkg] += size; pkg_gz[pkg] += comp

# ---- map real chunks to analyzer chunks (same source, different hash): closest size, greedy, within 3 % ----
mapping = {}
free = dict(analyzer_chunk_size)
for name, (size, _) in sorted(real.items(), key=lambda x: -x[1][0]):
    best = min(free.items(), key=lambda kv: abs(kv[1] - size), default=None)
    if best and abs(best[1] - size) <= max(64, size * 0.03):
        mapping[name] = best[0]
        del free[best[0]]

routes_using = collections.Counter(os.path.basename(p) for r in stats for p in r["firstLoadChunkPaths"])
all_routes = len(stats)
shared = [os.path.basename(p) for p in stats[0]["firstLoadChunkPaths"] if routes_using[os.path.basename(p)] == all_routes]
shared_raw = sum(real[c][0] for c in shared if c in real); shared_gz = sum(real[c][1] for c in shared if c in real)

kb = lambda n: f"{n / 1024:8.1f} kB"
lines = []
w = lines.append
w(f"FixedItNow frontend: production bundle sizes ({label.upper()})")
w(f"Generated: {datetime.datetime.now().astimezone().isoformat(timespec='seconds')}")
try:
    next_version = json.load(open(os.path.join(front, "node_modules/next/package.json")))["version"]
except OSError:
    next_version = "?"
w(f"Build: next {next_version} (Turbopack), `npm run build:perf` (= next build with frontend/.env.perf)")
w("Sizes: raw = minified bytes on disk; gzip = gzip -9 of each file (what the browser downloads).")
w("First Load JS = every JS chunk the route needs before it is interactive (from .next/diagnostics/route-bundle-stats.json).")
w("")
w(f"Shared by all {all_routes} routes: {len(shared)} chunks, {kb(shared_raw).strip()} raw / {kb(shared_gz).strip()} gzip")
w("")
w("== 1. First Load JS per route (largest first) ==")
w(f"{'route':42} {'raw':>11} {'gzip':>11} {'chunks':>6}")
rows = []
for r in stats:
    names = [os.path.basename(p) for p in r["firstLoadChunkPaths"]]
    raw = sum(real[n][0] for n in names if n in real); g = sum(real[n][1] for n in names if n in real)
    rows.append((r["route"], raw, g, len(names), r["firstLoadUncompressedJsBytes"]))
for route, raw, g, n, reported in sorted(rows, key=lambda x: -x[1]):
    w(f"{route:42} {kb(raw)} {kb(g)} {n:6d}")
mism = [r for r in rows if abs(r[1] - r[4]) > 1]
w(f"(cross-check: raw totals equal Next's firstLoadUncompressedJsBytes for {len(rows) - len(mism)}/{len(rows)} routes)")
w("")
w("== 2. Ten largest JS chunks ==")
w(f"{'chunk':26} {'raw':>11} {'gzip':>11} {'routes':>7}  main contents (share of the chunk)")
for name, (size, g) in sorted(real.items(), key=lambda x: -x[1][0])[:10]:
    a = mapping.get(name)
    if a:
        mods = chunk_modules[a]; total = sum(mods.values()) or 1
        top = ", ".join(f"{p} {100 * s / total:.0f}%" for p, s in mods.most_common(3))
    else:
        top = "(no analyzer match)"
    used = routes_using.get(name, 0)
    w(f"{name:26} {kb(size)} {kb(g)} {('all' if used == all_routes else str(used)) if used else 'lazy':>7}  {top}")
w("")
w("== 3. Client JS by dependency ==")
w(f"Source: `next analyze export --snapshot {label}`. Sizes are minified module bytes.")
w("  unique    = each module counted once (what the dependency itself weighs)")
w("  gzip      = analyzer's per-module gzip estimate (modules compressed one by one, so it overstates whole-file gzip)")
w("  in chunks = summed over every chunk that contains the module (> unique when it is duplicated across route chunks)")
w("  routes    = routes whose client bundle contains it (60 = every route)")
w(f"{'package / source':46} {'unique':>11} {'gzip':>11} {'in chunks':>11} {'routes':>7}")
total = sum(pkg_size.values())
for pkg, size in pkg_size.most_common(25):
    w(f"{pkg[:46]:46} {kb(size)} {kb(pkg_gz[pkg])} {kb(pkg_in_chunks[pkg])} {len(routes_of_pkg[pkg]):7d}")
w(f"{'TOTAL client JS':46} {kb(total)} {kb(sum(pkg_gz.values()))} {kb(sum(pkg_in_chunks.values()))}")
w("")
w("Third-party npm packages only (largest first):")
for pkg, size in [(p, s) for p, s in pkg_size.most_common() if not p.startswith(("app code", "other"))][:8]:
    w(f"  {pkg[:44]:44} {kb(size)} unique, on {len(routes_of_pkg[pkg])} routes")
w("")
w(f"Chunk mapping: {len(mapping)}/{len(real)} build chunks matched to analyzer chunks by size (same source, different hashes).")
os.makedirs(out, exist_ok=True)
open(os.path.join(out, "build-sizes.txt"), "w").write("\n".join(lines) + "\n")
json.dump({p: {"uniqueBytes": pkg_size[p], "gzipEstimateBytes": pkg_gz[p], "bytesInChunks": pkg_in_chunks[p], "routes": sorted(routes_of_pkg[p])} for p, _ in pkg_size.most_common()},
          open(os.path.join(out, "dependencies.json"), "w"), indent=2)
print("\n".join(lines))
