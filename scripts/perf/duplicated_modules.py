"""Client modules that appear in more than one JS chunk, from an analyzer graph export.

Usage (from frontend/): python3 -I scripts/perf/duplicated_modules.py docs/performance/<label>/analyzer-graph.jsonl.gz [filter]
Example: python3 -I scripts/perf/duplicated_modules.py docs/performance/before/analyzer-graph.jsonl.gz lucide-react

Prints how many modules (matching `filter`, a substring of the source path) are in client chunks, how many are in
more than one chunk, the bytes those extra copies add up to, and the most duplicated ones.
"""
import collections
import gzip
import json
import sys

graph = sys.argv[1]
needle = sys.argv[2] if len(sys.argv) > 2 else ""
chunks_of = collections.defaultdict(set)
size_of = {}
with gzip.open(graph, "rt") as f:
    for line in f:
        r = json.loads(line)
        if r.get("type") != "part" or "/static/chunks/" not in r["filename"]:
            continue
        src = r.get("source_path", "")
        if needle not in src:
            continue
        chunks_of[src].add(r["filename"].rsplit("/", 1)[-1])
        size_of[src] = r["size"]
dup = {m: len(c) for m, c in chunks_of.items() if len(c) > 1}
extra = sum(size_of[m] * (n - 1) for m, n in dup.items())
print(f"modules in client chunks: {len(chunks_of)}; in more than one chunk: {len(dup)}; extra copies: {extra / 1000:.1f} kB raw")
for m, n in sorted(dup.items(), key=lambda x: -x[1] * size_of[x[0]])[:15]:
    print(f"  {n:3d} chunks  {size_of[m]:6d} B  {m.replace('[project]/', '')}")
