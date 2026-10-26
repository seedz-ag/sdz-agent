#!/usr/bin/env python3
"""Compares the raw-*.json extraction outputs of two agents (same driver): row counts, column order, values."""
import json, glob, os, sys, collections
a, b, label = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else ""

def load(d):
    rows = collections.defaultdict(list)
    for f in sorted(glob.glob(os.path.join(d, 'raw-*.json'))):
        ent = os.path.basename(f).rsplit('-', 1)[0][4:]
        rows[ent].extend(json.load(open(f)))
    return rows

ra, rb = load(a), load(b)
ents = sorted(set(ra) | set(rb))
ok = True
print(f"{label} entity        dotnet   go      result")
for e in ents:
    xa, xb = ra.get(e, []), rb.get(e, [])
    note = []
    if len(xa) != len(xb):
        note.append(f"count {len(xa)} vs {len(xb)}"); ok = False
    if xa and xb:
        ka, kb = list(xa[0].keys()), list(xb[0].keys())
        if ka != kb:
            note.append(f"columns differ: only-dotnet={sorted(set(ka)-set(kb))} only-go={sorted(set(kb)-set(ka))} order={'same' if sorted(ka)==sorted(kb) else 'n/a'}"); ok = False
        sa = collections.Counter(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in xa)
        sb = collections.Counter(json.dumps(r, sort_keys=True, ensure_ascii=False) for r in xb)
        if sa != sb:
            da = list((sa - sb).elements())[:1]; db = list((sb - sa).elements())[:1]
            diffn = sum((sa - sb).values())
            # find first differing field
            detail = ""
            if da and db:
                ja, jb = json.loads(da[0]), json.loads(db[0])
                for k in ja:
                    if k in jb and ja[k] != jb[k]:
                        detail = f" e.g. {k}: {ja[k]!r} vs {jb[k]!r}"; break
            note.append(f"{diffn} rows differ{detail}"); ok = False
    print(f"{'':2}{e:<14}{len(xa):<9}{len(xb):<8}{'OK' if not note else '; '.join(note)}")
print("RESULT:", "IDENTICAL" if ok else "DIFFERENCES")
