#!/usr/bin/env python3
"""Build data/campus/campus-layout.json from a parsed campus site-plan DWG.

    node scripts/cad/dwg-dump.mjs campus.dwg /path/outside/repo/campus-parsed.json
    python3 scripts/cad/build_campus.py /path/outside/repo/campus-parsed.json

Requires `pip install shapely`. The original DWG is never modified and is not read by this script.

What it does (and deliberately does not do):
  * Building footprints come from outlines drawn in the DWG: closed regions (small gaps are closed by a
    buffer-and-shrink step) or, where an outline is drawn but left open, the polyline closed by joining its end to
    its start (the owner confirmed this for buildings 7 and 14). A number without a usable outline becomes a
    marker. No shape is invented.
  * Pitch, court and the green space (park) are regions read from the drawing; their anchor points were measured
    on the plot and are listed in campus-legend.json ("features").
  * The pond position/size, the trees and the gazebos are DECORATIVE: the plan does not contain them (the owner
    described a pond in the middle of the green space). They are generated with a fixed seed and flagged so
    nobody reads them as survey data.
  * Coordinates are re-centred on the middle of the drawing and the georeference (UTM) is dropped. The shared
    convention is used: meters, X east, Z south (so Z = -northing), Y up.
  * Heights are NOT in a site plan: floors from the legend x storeyHeight, flagged as an estimate.
"""
from __future__ import annotations

import json
import math
import random
import re
import sys
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import nearest_points, unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parents[2]
LEGEND = ROOT / "scripts/cad/campus-legend.json"
OUT = ROOT / "data/campus/campus-layout.json"

VEGETATION_LAYER = "V-SITE-VEGE"
# gap-closing tolerances tried in order for each building (meters); the smallest that closes the outline wins
TOLERANCES = (0.3, 1.0, 2.5)
MIN_AREA, MAX_AREA = 100.0, 4000.0
MAX_CLOSING_GAP = 25.0  # an open outline whose ends are further apart than this is not closed automatically
WALL_TRIM = 0.25  # window-band / ledge outline sits this far outside the walls
WALK_CLEARANCE = 1.5  # pedestrians keep this far from buildings, courts and the pond (routing obstacles)
SEED = 20261121
MAX_TREES = 260


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
    ox, oy = minx, miny  # drawing-local origin: SW corner of the extents
    shx, shy = (maxx - minx) / 2, (maxy - miny) / 2  # drawing-local centre

    def to_c(x: float, y: float) -> dict:
        """drawing-local (x east, y north) -> campus (x east, z south), centred."""
        return {"x": r2(x - shx), "z": r2(-(y - shy))}

    def flat(coords) -> list[float]:
        out: list[float] = []
        for x, y in coords:
            c = to_c(x, y)
            out += [c["x"], c["z"]]
        return out

    def ring(poly: Polygon) -> list[dict]:
        return [to_c(x, y) for x, y in list(poly.exterior.coords)[:-1]]

    def arc_points(e, n=24):
        a0, a1 = e["startAngle"], e["endAngle"]
        if a1 <= a0:
            a1 += 2 * math.pi
        c, r = e["center"], e["radius"]
        return [(c["x"] - ox + r * math.cos(a0 + (a1 - a0) * i / n), c["y"] - oy + r * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]

    def geom_of(e):
        t = e["type"]
        if t == "LINE":
            s, d = e["startPoint"], e["endPoint"]
            return LineString([(s["x"] - ox, s["y"] - oy), (d["x"] - ox, d["y"] - oy)])
        if t == "LWPOLYLINE":
            v = [(p["x"] - ox, p["y"] - oy) for p in e["vertices"]]
            if e.get("flag", 0) & 1:
                v.append(v[0])
            return LineString(v) if len(v) > 1 else None
        if t == "ARC":
            return LineString(arc_points(e))
        if t == "CIRCLE":
            c, r = e["center"], e["radius"]
            return LineString([(c["x"] - ox + r * math.cos(2 * math.pi * i / 36), c["y"] - oy + r * math.sin(2 * math.pi * i / 36)) for i in range(37)])
        return None

    linear = [(e, geom_of(e)) for e in ents if e["type"] in ("LINE", "LWPOLYLINE", "ARC", "CIRCLE")]
    linear = [(e, g) for e, g in linear if g is not None]
    plan_lines = [g for e, g in linear if e["layer"] != VEGETATION_LAYER]

    def closed_faces(lines, tol):
        """Enclosed regions of a line set, tolerating gaps up to ~2*tol."""
        u = unary_union(lines).buffer(tol, cap_style="flat", join_style="mitre")
        polys = [u] if isinstance(u, Polygon) else list(u.geoms)
        return [Polygon(r).buffer(tol, join_style="mitre") for p in polys for r in p.interiors]

    faces = {t: closed_faces(plan_lines, t) for t in TOLERANCES}
    # open polylines closed by joining end to start (only when the gap is small compared with the outline)
    closed_polylines: list[Polygon] = []
    seen = set()
    for e in ents:
        if e["type"] != "LWPOLYLINE" or e["layer"] == VEGETATION_LAYER or len(e["vertices"]) < 4:
            continue
        v = [(p["x"] - ox, p["y"] - oy) for p in e["vertices"]]
        if math.hypot(v[0][0] - v[-1][0], v[0][1] - v[-1][1]) > MAX_CLOSING_GAP:
            continue
        pg = Polygon(v)
        key = (round(pg.area), tuple(round(c) for c in pg.bounds))
        if pg.is_valid and MIN_AREA < pg.area < MAX_AREA and key not in seen:
            seen.add(key)
            closed_polylines.append(pg)

    # --- labels (the numbers printed on the plan) and entrance texts
    labels: dict[int, list[tuple[float, float]]] = {}
    entrance_pts = []
    for e in ents:
        if e["type"] != "MTEXT":
            continue
        txt = strip_mtext(e["text"])
        p = (e["insertionPoint"]["x"] - ox, e["insertionPoint"]["y"] - oy)
        if re.fullmatch(r"\d+", txt):
            labels.setdefault(int(txt), []).append(p)
        elif txt == "درب ورود":
            entrance_pts.append(p)

    # --- buildings
    storey = float(legend["storeyHeight"])
    buildings, taken, taken_ids = [], [], []
    for item in legend["buildings"]:
        n = item["number"]
        pts = labels.get(n, [])
        if not pts:
            print(f"WARNING: no label {n} in drawing", file=sys.stderr)
            continue
        poly, how = None, ""
        if item["footprint"]:
            for tol in TOLERANCES:
                hit = sorted((f for f in faces[tol] if f.contains(Point(pts[0])) and MIN_AREA < f.area < MAX_AREA), key=lambda f: f.area)
                if hit:
                    poly = hit[0].buffer(-1.2, join_style="mitre").buffer(1.2, join_style="mitre")  # drop thin tendrils
                    if poly.geom_type != "Polygon":
                        poly = max(poly.geoms, key=lambda g: g.area)
                    poly, how = poly.simplify(0.25), f"closed region (gap tolerance {tol} m)"
                    break
            if poly is None:
                hit = sorted((f for f in closed_polylines if f.contains(Point(pts[0]))), key=lambda f: f.area)
                if hit:
                    poly, how = hit[0].simplify(0.2), "open outline closed end-to-start"
            if poly is None:
                print(f"NOTE: building {n} has no usable outline; shown as a marker", file=sys.stderr)
            else:
                print(f"building {n}: {poly.area:.0f} m2 from {how}")
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
            b0 = poly.bounds
            entry["position"] = to_c(c.x, c.y)
            entry["size"] = {"width": r2(b0[2] - b0[0]), "depth": r2(b0[3] - b0[1]), "height": height}
            entry["footprint"] = ring(poly)
            entry["trim"] = ring(poly.buffer(WALL_TRIM, join_style="mitre").simplify(0.15))
            taken.append(poly)
            taken_ids.append(entry["id"])
            buildings.append(entry)
        else:
            for k, (px, py) in enumerate(pts):
                if k and any(math.hypot(px - qx, py - qy) < 5 for qx, qy in pts[:k]):
                    continue
                e2 = dict(entry)
                if k:
                    e2["id"] = f"campus-b{n}-{k + 1}"
                e2["position"] = to_c(px, py)
                e2["size"] = {"width": 6.0, "depth": 6.0, "height": 1.0}
                buildings.append(e2)

    # --- ground outline: the property boundary drawn in the plan (layer C-HYDR-CTCH-HDPT, the long closed polyline).
    # The campus is NOT convex (a notch at the north-east), so the old convex hull wrongly added empty land.
    boundary = [
        [(p["x"] - ox, p["y"] - oy) for p in e["vertices"]]
        for e in ents
        if e["type"] == "LWPOLYLINE" and e["layer"] == "C-HYDR-CTCH-HDPT" and len(e["vertices"]) >= 8
    ]
    all_pts = [pt for _, g in linear for pt in g.coords]
    if boundary:
        hull = Polygon(max(boundary, key=len)).buffer(0)
    else:
        print("WARNING: no property boundary in the drawing; using the convex hull", file=sys.stderr)
        hull = MultiPoint(all_pts).convex_hull.buffer(6, join_style="mitre")
    hull_p = prep(hull)
    # pockets = land inside the convex hull but outside the boundary: pedestrians cannot walk there (routing obstacles)
    gap = MultiPoint(list(hull.exterior.coords)).convex_hull.difference(hull)
    pockets = [g for g in ([gap] if gap.geom_type == "Polygon" else list(getattr(gap, "geoms", []))) if g.geom_type == "Polygon" and g.area > 2]

    # --- regions measured on the plot (anchors in legend.features, drawing-local meters)
    feats = legend["features"]
    all_faces = closed_faces([g for _, g in linear], 1.0)

    def face_at(anchor, lo, hi):
        hit = sorted((f for f in all_faces if f.contains(Point(anchor)) and lo < f.area < hi), key=lambda f: f.area)
        return hit[0] if hit else None

    areas, obstacles = [], list(taken)
    park = face_at(feats["park"]["anchor"], 1500, 6000)
    pitch_src = face_at(feats["pitch"]["anchor"], 200, 1200)
    court_pts = [g for e, g in linear if e["layer"] == "C-HYDR-CTCH-HDPT" and g.distance(Point(feats["court"]["anchor"])) < feats["court"]["radius"] and g.length < 40]
    court_src = unary_union(court_pts).convex_hull if court_pts else None
    if park is None or pitch_src is None or court_src is None:
        print("WARNING: could not recover park/pitch/court regions", file=sys.stderr)
    sports_shapes, sports_ids = [], []
    for key, region, rotate in (("park", park, False), ("pitch", pitch_src, True), ("court", court_src, True)):
        if region is None:
            continue
        shape = region.minimum_rotated_rectangle if rotate else region.simplify(0.3)
        areas.append({"id": f"area-{key}", "kind": key, "name": feats[key]["name"], "polygon": ring(shape)})
        if key != "park":
            obstacles.append(shape)
            sports_shapes.append(shape)
            sports_ids.append(f"area-{key}")

    # planting beds drawn on the vegetation layer: closed outlines (duplicates dropped)
    beds, seen_beds = [], set()
    for e in ents:
        if e["layer"] != VEGETATION_LAYER or e["type"] != "LWPOLYLINE" or len(e["vertices"]) < 4:
            continue
        pg = Polygon([(p["x"] - ox, p["y"] - oy) for p in e["vertices"]])
        key = (tuple(round(c) for c in pg.bounds), len(e["vertices"]))
        if key in seen_beds or not pg.is_valid or not 4 < pg.area < 900:
            continue
        seen_beds.add(key)
        if any(pg.intersects(o.buffer(0.5)) for o in obstacles):
            continue  # overlaps a building, pitch or court outline: a drafting artefact, not a bed
        beds.append(pg.simplify(0.2))
    for i, bd in enumerate(beds):
        areas.append({"id": f"area-bed-{i + 1}", "kind": "bed", "name": None, "polygon": ring(bd)})

    # --- decorative pond (the owner: "a pond in the middle of the green space"); position/size are approximate
    ponds, pond_shape, theta, long_len = [], None, 0.0, 0.0
    if park is not None:
        rc = list(park.minimum_rotated_rectangle.exterior.coords)
        e1 = (rc[1][0] - rc[0][0], rc[1][1] - rc[0][1])
        e2 = (rc[2][0] - rc[1][0], rc[2][1] - rc[1][1])
        long_v = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
        long_len = max(math.hypot(*e1), math.hypot(*e2))
        theta = math.atan2(long_v[1], long_v[0])  # angle of the long axis in drawing space (ccw from +x)
        pc = park.centroid
        a, b = 0.17 * long_len, 0.13 * long_len
        pcc = to_c(pc.x, pc.y)
        ponds.append({"id": "pond-1", "x": pcc["x"], "z": pcc["z"], "rx": r2(a), "rz": r2(b), "angle": r2(theta), "decorative": True})
        pond_shape = affinity.rotate(affinity.scale(Point(pc.x, pc.y).buffer(1, 32), a, b), math.degrees(theta), origin=(pc.x, pc.y))
        obstacles.append(pond_shape)

    # --- gazebos: the plan draws a hexagon (round gazebo) and a rotated square (square gazebo) on layer C-SSWR-PROF; the
    # owner marked a third (square) in the south-west corner. Positions come from the plan / the owner, not from us.
    props: list[dict] = []
    gazebo_shapes: list[Polygon] = []

    def add_gazebo(shape: str, cx: float, cy: float, size: float, angle: float, source: str, poly: Polygon | None = None):
        c = to_c(cx, cy)
        props.append({"id": f"gazebo-{len(props) + 1}", "kind": "gazebo", "shape": shape, "x": c["x"], "z": c["z"], "angle": r2(angle), "size": r2(size), "source": source})
        gazebo_shapes.append(poly if poly is not None else Point(cx, cy).buffer(size * (1.0 if shape == "round" else 1.42), 16))

    for e in ents:
        if e["type"] != "LWPOLYLINE" or e["layer"] != "C-SSWR-PROF":
            continue
        v = [(p["x"] - ox, p["y"] - oy) for p in e["vertices"]]
        pg = Polygon(v)
        c = pg.centroid
        rad = sum(math.hypot(x - c.x, y - c.y) for x, y in v) / len(v)
        if len(v) == 4:  # diamond on the plan = square gazebo turned to the street grid
            add_gazebo("square", c.x, c.y, rad / math.sqrt(2), math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0]), "plan", pg)
        elif len(v) >= 5:  # hexagon = round gazebo
            add_gazebo("round", c.x, c.y, rad, 0.0, "plan", pg)
    for g in feats.get("gazebos", []):
        add_gazebo(g["shape"], g["anchor"][0], g["anchor"][1], g["size"], math.radians(g.get("angleDeg", 0)), "owner")

    # beds that contain a gazebo become lawn (the gazebo stands on grass, no shrubs/trees)
    for area in areas:
        if area["kind"] == "bed" and any(Polygon([(p["x"] + shx, shy - p["z"]) for p in area["polygon"]]).intersects(gz) for gz in gazebo_shapes):
            area["kind"] = "lawn"

    # --- decorative trees (seeded, deterministic). The owner: trees/greenery ONLY where the plan marks vegetation
    # (planting beds and the park); everywhere else stays paved, including the grey plots in the north.
    rnd = random.Random(SEED)
    keep_out = prep(unary_union([o.buffer(2.5) for o in [*obstacles, *gazebo_shapes]]))
    placed: list[tuple[float, float]] = []
    trees: list[dict] = []

    def ok(x, y, gap):
        if keep_out.contains(Point(x, y)):
            return False
        return all(math.hypot(x - qx, y - qy) >= gap for qx, qy in placed)

    def add_tree(x, y, kind=None, scale=None):
        placed.append((x, y))
        c = to_c(x, y)
        trees.append({"x": c["x"], "z": c["z"], "kind": kind or ("pine" if rnd.random() < 0.3 else "round"), "scale": r2(scale or rnd.uniform(0.8, 1.4))})

    if park is not None and pond_shape is not None:  # a ring around the pond and along the edge of the green space
        pc = park.centroid
        for i in range(14):
            ang = 2 * math.pi * i / 14 + rnd.uniform(-0.15, 0.15)
            x, y = pc.x + math.cos(ang + theta) * a * 1.9, pc.y + math.sin(ang + theta) * b * 2.1
            if park.buffer(-2).contains(Point(x, y)) and ok(x, y, 4):
                add_tree(x, y)
        edge = park.buffer(-3.2).exterior
        for i in range(int(edge.length // 9)):
            pt = edge.interpolate(i * 9 + rnd.uniform(-1, 1))
            if ok(pt.x, pt.y, 5) and not pond_shape.buffer(4).contains(pt):
                add_tree(pt.x, pt.y)
        for _ in range(400):  # a few more on the park lawn
            if len(trees) >= 60:
                break
            x0, y0, x1, y1 = park.bounds
            x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
            if park.buffer(-3).contains(Point(x, y)) and not pond_shape.buffer(5).contains(Point(x, y)) and ok(x, y, 7):
                add_tree(x, y)
    for area in [a_ for a_ in areas if a_["kind"] == "bed"]:
        bd = Polygon([(p["x"] + shx, shy - p["z"]) for p in area["polygon"]])
        x0, y0, x1, y1 = bd.bounds
        for _ in range(int(bd.area // 40) + 1):
            for _try in range(20):
                x, y = rnd.uniform(x0, x1), rnd.uniform(y0, y1)
                if bd.contains(Point(x, y)) and all(math.hypot(x - qx, y - qy) >= 4 for qx, qy in placed):
                    add_tree(x, y, "round", rnd.uniform(0.7, 1.1))
                    break

    # --- context linework: sports markings, hedge lines, other site lines (building edges skipped)
    taken_union = unary_union([t.buffer(1.0) for t in taken]) if taken else None
    sports_zone = unary_union([s.buffer(1.0) for s in sports_shapes]) if sports_shapes else None
    groups: dict[str, list[list[float]]] = {"vegetation": [], "sports": [], "site": []}

    def add(kind, g):
        g = g.simplify(0.25)
        if not g.is_empty and g.length >= 0.8:
            groups[kind].append(flat(g.coords))

    inside_site = prep(hull.buffer(0.5))
    for e, g in linear:
        mid = g.interpolate(0.5, normalized=True)
        if not inside_site.contains(mid):
            continue  # drawing symbols outside the property line (e.g. the gate arrows) are not campus ground
        if e["layer"] == VEGETATION_LAYER:
            if e["type"] in ("LINE", "ARC"):
                add("vegetation", g)  # hedge lines; closed outlines became planting beds above
            continue
        if taken_union is not None and taken_union.contains(mid):
            continue  # a building edge: the extruded footprint already draws it
        add("sports" if sports_zone is not None and sports_zone.contains(mid) else "site", g)

    # --- routing obstacles: buildings, sports areas and the pond, inflated by the walking clearance
    nav_obstacles = []
    gz_ids = [p_["id"] for p_ in props]
    for oid, shape in [*zip(taken_ids, taken), *zip(sports_ids, sports_shapes), *zip(gz_ids, gazebo_shapes), *([("pond-1", pond_shape)] if pond_shape is not None else [])]:
        infl = shape.buffer(WALK_CLEARANCE, join_style="mitre", mitre_limit=2.0).simplify(0.4)
        nav_obstacles.append({"id": oid, "ring": ring(infl)})
    for i, pk in enumerate(pockets):  # land outside the property line (e.g. the north-east notch): not walkable
        nav_obstacles.append({"id": f"outside-{i + 1}", "ring": ring(pk.simplify(0.3))})

    # --- entrances: the owner removed the north-east gate (it opens onto land outside the campus); the remaining gate
    # text sits just outside the boundary, so it is moved onto the boundary (1.5 m inside)
    entrances = []
    for px, py in sorted(entrance_pts):
        if any(math.hypot(px - rx, py - ry) < rr for rx, ry, rr in legend["features"].get("removeEntrances", [])):
            continue
        pt = Point(px, py)
        if not hull.contains(pt):
            pt = nearest_points(hull.buffer(-1.5), pt)[0]
        entrances.append({"id": f"campus-entrance-{len(entrances) + 1}", "label": "درب ورود", **to_c(pt.x, pt.y)})

    bounds = hull.bounds
    layout = {
        "isDemo": False,
        "source": {
            "kind": "cad",
            "note": "پلان محوطه از فایل CAD ارائه‌شده توسط مالک پروژه استخراج شده است. نام و توضیح ساختمان‌ها طبق جدول ارائه‌شده توسط مالک پروژه است و هنوز توسط دانشگاه تأیید رسمی نشده. ارتفاع ساختمان‌ها در نقشه نیست و فقط برای نمایش و بر اساس تعداد طبقات تخمین زده شده است. مرز محوطه از خط مرز ملک در نقشه است. الاچیق‌ها از نقشه (شش‌ضلعی و لوزی) و علامت‌گذاری مالک آمده‌اند. درخت‌ها فقط در فضای سبز و باغچه‌های مشخص‌شده در نقشه و به‌صورت نمادین گذاشته شده‌اند و موقعیت و اندازهٔ حوض هم نمادین است.",
        },
        "ground": {"width": r2(bounds[2] - bounds[0]), "depth": r2(bounds[3] - bounds[1]), "outline": ring(hull)},
        "buildings": buildings,
        "areas": areas,
        "ponds": ponds,
        "props": props,
        "entrances": entrances,
        "linework": [{"kind": k, "polylines": v} for k, v in groups.items() if v],
        "nav": {"clearance": WALK_CLEARANCE, "obstacles": nav_obstacles},
        "paths": [],
        "trees": trees,
    }
    OUT.write_text(json.dumps(layout, ensure_ascii=False, separators=(",", ":")) + "\n")
    n_fp = sum(1 for b in buildings if b["kind"] == "building")
    print(f"wrote {OUT.relative_to(ROOT)}: {n_fp} footprints, {len(buildings) - n_fp} markers, {len(areas)} areas, {len(trees)} trees, "
          f"{len(props)} gazebos, {sum(len(g['polylines']) for g in layout['linework'])} polylines, {len(entrances)} entrances, {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
