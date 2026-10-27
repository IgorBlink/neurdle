"""Export game data into public/data from the generation outputs in ~/Documents/qwen-steering.

python3 scripts/export_data.py ~/Documents/qwen-steering

puzzles.json  {base: {question: unsteered answer}, puzzles: [...]} from the raw answers and neurdle_pick.json
geo.json      {side, layers, wide, vocab, targets, kl, nid, up, down} for the map; targets: id -> [[layer, row, col, neuron]];
              kl, nid, up, down are base64 little-endian arrays per sheet cell (layer * side^2 + row * side + col):
              kl uint8 (steering strength), nid uint16 (neuron), up/down uint16|uint32 (index into vocab)
"""
import json
import sys
from pathlib import Path

src = Path(sys.argv[1]).expanduser()
out = Path(__file__).resolve().parent.parent / "public" / "data"
out.mkdir(parents=True, exist_ok=True)

raws = [json.loads((src / "out" / f).read_text()) for f in ("puzzles_raw.json", "puzzles_raw2.json")]
clean = lambda t: t.replace("�", "").rstrip()  # emoji cut at a token boundary
base = {q: clean(t) for q, t in next(r["base"] for r in raws if "base" in r).items()}
rows = {(r["key"], r["q"], r["seed"]): r for raw in raws for r in raw["rows"]}


def recipe(spec):
    if spec.startswith("vec "):
        _, persona, layer, alpha = spec.split()
        return f"vector {persona} @ layer {layer} x{alpha}"
    return spec


puzzles = []
for p in json.loads((src / "neurdle_pick.json").read_text()):
    main, hint = rows[(p["key"], *p["main"])], rows[(p["key"], *p["hint"])]
    puzzles.append(dict(id=p["key"], label=p["label"], note=p["note"], group=p.get("group", ""), recipe=recipe(main["spec"]),
                        q=main["q"], a=clean(main["text"]), hintQ=hint["q"], hint=clean(hint["text"])))
(out / "puzzles.json").write_text(json.dumps(dict(base=base, puzzles=puzzles), ensure_ascii=False))

geo = json.loads((src / "out" / "geo.json").read_text())  # kl, nid, up, down stay base64: artifacts serve no .bin
geo["vocab"] = [w.replace("�", "") for w in geo["vocab"]]
for stale in out.glob("*.bin"):
    stale.unlink()
(out / "geo.json").write_text(json.dumps(geo, ensure_ascii=False))
print(f"{len(puzzles)} puzzles, {len(geo['targets'])} map targets ->", out)
for f in sorted(out.iterdir()):
    print(f"  {f.name:14} {f.stat().st_size:>9,} bytes")
