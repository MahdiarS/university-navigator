#!/usr/bin/env python3
"""Build data/campus/campus-layout.json from a parsed campus site-plan DWG.

    node scripts/cad/dwg-dump.mjs campus.dwg /path/outside/repo/campus-parsed.json
    python3 scripts/cad/build_campus.py /path/outside/repo/campus-parsed.json

Requires `pip install shapely`. The original DWG is never modified and is not read by this script.

What it does (and deliberately does not do):
  * Building footprints come from the closed outlines drawn in the DWG. Outlines with small gaps are closed by a
    buffer-and-shrink step; a number whose outline is not closed (legend: "footprint": false) becomes a marker.
    No shape is ever invented.
  * Coordinates are re-centred on the middle of the drawing and the georeference (UTM) is dropped. The shared
    convention is used: meters, X east, Z south (so Z = -northing), Y up.
  * Heights are NOT in a site plan. They are a visualisation estimate: floors from the legend x storeyHeight.
"""
from __future__ import annotations

import json
import math
import re
import sys
from pathlib import Path

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
LEGEND = ROOT / "scripts/cad/campus-legend.json"
OUT = ROOT / "data/campus/campus-layout.json"

# Layers that carry building / site outlines in the supplied drawing (see docs/cad-import-guide.md).
OUTLINE_LAYERS = {
    "C-ANNO-MATC-TEXT", "0", "C-HYDR-CTCH-HDPT", "C-HYDR-CTCH-FSPT", "C-ANNO-TABL", "C-ESMT-ROAD", "C-PROP-BRNG",
}
VEGETATION_LAYER = "V-SITE-VEGE"
# gap-closing tolerances tried in order for each building (meters); the smallest that closes the outline wins
TOLERANCES = (0.3, 1.0, 2.5)
MIN_AREA, MAX_AREA = 100.0, 4000.0
# the sports pitch occupies this box (drawing-local meters, measured on the plot); its lines get their own style
SPORTS_BOX = (40.0, 226.0, 96.0, 264.0)


def strip_mtext(text: str) -> str:
    return re.sub(r"\\f[^;]*;", "", text).replace("{", "").replace("}", "").replace("\\P", " ").strip()


def r2(v: float) -> float:
    return round(v, 2)


def fa(n: int) -> str:
    """Persian digits for display labels."""
    return str(n).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def main(parsed_path: str) -> None:
    db = json.loads(Path(parsed_path).read_text())
    legend = json.loads(LEGEND.read_text())
    ents = db["entities"]
    if db.get("header", {}).get("INSUNITS") not in (6, None):
        print("WARNING: drawing units are not meters; check scale before trusting this output", file=sys.stderr)

    # --- drawing extents (ignore stray 0,0 points) -> local origin
    xs, ys = [], []
    for e in ents:
        for key in ("startPoint", "endPoint", "center"):
            p = e.get(key)
            if p and abs(p["x"]) > 1:
                xs.append(p["x"]); ys.append(p["y"])
        for p in e.get("vertices") or []:
            if isinstance(p, dict) and "x" in p and abs(p["x"]) > 1:
                xs.append(p["x"]); ys.append(p["y"])
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    cx, cy = (minx + maxx) / 2, (miny + maxy) / 2
    # drawing-local coordinates used for polygon work: origin at SW corner of the extents
    ox, oy = minx, miny

    def arc_points(e, n=24):
        a0, a1 = e["startAngle"], e["endAngle"]
        if a1 <= a0:
            a1 += 2 * math.pi
        c, r = e["center"], e["radius"]
        return [(c["x"] - ox + r * math.cos(a0 + (a1 - a0) * i / n), c["y"] - oy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

    def linework(layers):
        out = []
        for e in ents:
            if e["layer"] not in layers:
                continue
            t = e["type"]
            if t == "LINE":
                s, d = e["startPoint"], e["endPoint"]
                out.append(LineString([(s["x"] - ox, s["y"] - oy), (d["x"] - ox, d["y"] - oy)]))
            elif t == "LWPOLYLINE":
                v = [(p["x"] - ox, p["y"] - oy) for p in e["vertices"]]
                if e.get("flag", 0) & 1:
                    v.append(v[0])
                if len(v) > 1:
                    out.append(LineString(v))
            elif t == "ARC":
                out.append(LineString(arc_points(e)))
        return out

    def closed_faces(lines, tol):
        """Enclosed regions of a line set, tolerating gaps up to ~2*tol."""
        u = unary_union(lines).buffer(tol, cap_style="flat", join_style="mitre")
        polys = [u] if isinstance(u, Polygon) else list(u.geoms)
        return [Polygon(r).buffer(tol, join_style="mitre") for p in polys for r in p.interiors]

    outline_lines = linework(OUTLINE_LAYERS)
    faces = {t: closed_faces(outline_lines, t) for t in TOLERANCES}

    # --- labels (the numbers printed on the plan) and entrance texts
    labels: dict[int, list[tuple[float, float]]] = {}
    entrances = []
    for e in ents:
        if e["type"] != "MTEXT":
            continue
        txt = strip_mtext(e["text"])
        p = (e["insertionPoint"]["x"] - ox, e["insertionPoint"]["y"] - oy)
        if re.fullmatch(r"\d+", txt):
            labels.setdefault(int(txt), []).append(p)
        elif txt == "درب ورود":
            entrances.append(p)

    # --- buildings
    storey = float(legend["storeyHeight"])
    buildings, taken = [], []
    for item in legend["buildings"]:
        n = item["number"]
        pts = labels.get(n, [])
        if not pts:
            print(f"WARNING: no label {n} in drawing", file=sys.stderr)
            continue
        poly = None
        if item["footprint"]:
            for tol in TOLERANCES:
                hit = sorted((f for f in faces[tol] if f.contains(Point(pts[0])) and MIN_AREA < f.area < MAX_AREA), key=lambda f: f.area)
                if hit:
                    poly = hit[0].buffer(-1.2, join_style="mitre").buffer(1.2, join_style="mitre")  # drop thin tendrils
                    if poly.geom_type != "Polygon":
                        poly = max(poly.geoms, key=lambda g: g.area)
                    poly = poly.simplify(0.25)
                    break
            if poly is None:
                print(f"NOTE: building {n} has no closed outline; shown as a marker", file=sys.stderr)
        floors = item["floors"]
        height = (floors or 1) * storey
        name = item["name"]
        label = f"ساختمان {fa(n)} — {name}" if name else f"شماره {fa(n)}"
        entry = {
            "id": f"campus-b{n}",
            "number": n,
            "label": label,
            "name": name,
            "description": item["description"],
            "floors": floors,
            "heightIsEstimate": True,
            "buildingId": None,
            "slug": None,
            # only buildings the owner has named can be selected; unnamed numbers are plain markers
            "clickable": bool(name),
            "entrance": None,
            "kind": "building" if poly is not None else "marker",
        }
        if poly is not None:
            c = poly.centroid
            minx_, miny_, maxx_, maxy_ = poly.bounds
            entry["position"] = {"x": r2(c.x - (cx - ox)), "z": r2(-(c.y - (cy - oy)))}
            entry["size"] = {"width": r2(maxx_ - minx_), "depth": r2(maxy_ - miny_), "height": height}
            ring = list(poly.exterior.coords)[:-1]
            entry["footprint"] = [{"x": r2(x - (cx - ox)), "z": r2(-(y - (cy - oy)))} for x, y in ring]
            taken.append(poly.buffer(1.0))
            buildings.append(entry)
        else:
            for k, (px, py) in enumerate(pts):
                if k and any(math.hypot(px - qx, py - qy) < 5 for qx, qy in pts[:k]):
                    continue
                e2 = dict(entry)
                if k:
                    e2["id"] = f"campus-b{n}-{k + 1}"
                e2["position"] = {"x": r2(px - (cx - ox)), "z": r2(-(py - (cy - oy)))}
                e2["size"] = {"width": 6.0, "depth": 6.0, "height": 1.0}
                buildings.append(e2)

    # --- context linework (flat lines on the ground): vegetation, sports pitch, other site lines
    taken_union = unary_union(taken) if taken else None
    groups: dict[str, list[list[float]]] = {"vegetation": [], "sports": [], "site": []}

    def add(kind, geom):
        g = geom.simplify(0.25)
        if g.is_empty or g.length < 0.8:
            return
        flat = []
        for x, y in g.coords:
            flat += [r2(x - (cx - ox)), r2(-(y - (cy - oy)))]
        groups[kind].append(flat)

    for e in ents:
        t = e["type"]
        if t not in ("LINE", "LWPOLYLINE", "ARC", "CIRCLE") or e["layer"] not in OUTLINE_LAYERS | {VEGETATION_LAYER}:
            continue
        if t == "LINE":
            s, d = e["startPoint"], e["endPoint"]
            g = LineString([(s["x"] - ox, s["y"] - oy), (d["x"] - ox, d["y"] - oy)])
        elif t == "LWPOLYLINE":
            v = [(p["x"] - ox, p["y"] - oy) for p in e["vertices"]]
            if e.get("flag", 0) & 1:
                v.append(v[0])
            if len(v) < 2:
                continue
            g = LineString(v)
        elif t == "ARC":
            g = LineString(arc_points(e))
        else:  # CIRCLE
            c, r = e["center"], e["radius"]
            g = LineString([(c["x"] - ox + r * math.cos(2 * math.pi * i / 36), c["y"] - oy + r * math.sin(2 * math.pi * i / 36)) for i in range(37)])
        if taken_union is not None and e["layer"] != VEGETATION_LAYER and taken_union.contains(g.interpolate(0.5, normalized=True)):
            continue  # a building edge: the extruded footprint already draws it
        mid = g.interpolate(0.5, normalized=True)
        if e["layer"] == VEGETATION_LAYER:
            add("vegetation", g)
        elif SPORTS_BOX[0] <= mid.x <= SPORTS_BOX[2] and SPORTS_BOX[1] <= mid.y <= SPORTS_BOX[3]:
            add("sports", g)
        else:
            add("site", g)

    w = maxx - minx
    d = maxy - miny
    layout = {
        "isDemo": False,
        "source": {
            "kind": "cad",
            "note": "پلان محوطه از فایل CAD ارائه‌شده توسط مالک پروژه استخراج شده است. نام و توضیح ساختمان‌ها طبق جدول ارائه‌شده توسط مالک پروژه است و هنوز توسط دانشگاه تأیید رسمی نشده. ارتفاع ساختمان‌ها در نقشه نیست و فقط برای نمایش و بر اساس تعداد طبقات تخمین زده شده است.",
        },
        "ground": {"width": r2(w), "depth": r2(d)},
        "buildings": buildings,
        "entrances": [
            {"id": f"campus-entrance-{i + 1}", "label": "درب ورود", "x": r2(px - (cx - ox)), "z": r2(-(py - (cy - oy)))}
            for i, (px, py) in enumerate(sorted(entrances))
        ],
        "linework": [{"kind": k, "polylines": v} for k, v in groups.items() if v],
        "paths": [],
        "trees": [],
    }
    OUT.write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")) + "\n")
    n_fp = sum(1 for b in buildings if b["kind"] == "building")
    print(f"wrote {OUT.relative_to(ROOT)}: {n_fp} footprints, {len(buildings) - n_fp} markers, "
          f"{sum(len(g['polylines']) for g in layout['linework'])} polylines, {len(entrances)} entrances, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
