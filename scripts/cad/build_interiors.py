#!/usr/bin/env python3
"""
First-floor interiors of campus buildings 1, 2 and 3 + the two sky bridges between them.

Inputs (both committed):
  data/campus/campus-layout.json   building footprints / outdoor doors (from the site plan, see build_campus.py)
  scripts/cad/floorplans.py        corridor and room rectangles per building (from the owner's hand-drawn sketches)
  scripts/cad/campus-offices.json  room numbers, names, field and confidence

Outputs (data/indoor/):
  buildings / floors / rooms / departments / department-services / entrances / facilities /
  navigation-nodes / navigation-edges  .json   the relational data the app (and Supabase) use
  interiors.json                               room / corridor polygons and bridge geometry for the 3D scene
  ../../database/seed.sql is written by scripts/generate-seed-sql.mjs

The sketches are schematic (not to scale, not the real wall layout), so the geometry is DESIGNED here: every
building keeps its real footprint from the site plan, gets a central corridor (an L for building 3), rooms are cut
along it in the order the sketch lists them, the stair lobby sits at the owner-marked outdoor door and the bridge
vestibules at the sky bridges. Nothing here is a survey.

Run:  python3 -I scripts/cad/build_interiors.py
Coordinates: meters, X east, Z south (same as the campus scene); Y up, first floor walking surface = 3.6 m.
"""
import json
import math
import sys
from pathlib import Path

from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import nearest_points, unary_union

sys.path.insert(0, str(Path(__file__).resolve().parent))
from floorplans import PLANS  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "indoor"
PHI = -11.3  # direction of the long walls in the plan (degrees, same for the three buildings)
STOREY = 3.6
CORR_W = 2.2
HALF = CORR_W / 2
BRIDGE_X = -24.5  # the two sky bridges run north-south along this line (the buildings sit one behind the other)
BRIDGE_W = 2.4
NUM_FA = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa(n) -> str:
    return str(n).translate(NUM_FA)


def r2(v: float) -> float:
    return round(v + 0.0, 2)


def to_local(g):
    return affinity.rotate(g, -PHI, origin=(0, 0))


def to_world(g):
    return affinity.rotate(g, PHI, origin=(0, 0))


def pt_world(u: float, v: float) -> tuple[float, float]:
    p = to_world(Point(u, v))
    return p.x, p.y


def largest(g):
    if g.is_empty:
        return None
    if isinstance(g, Polygon):
        return g
    parts = [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]
    return max(parts, key=lambda p: p.area) if parts else None


def ring(poly: Polygon):
    return [{"x": r2(x), "z": r2(z)} for x, z in list(poly.exterior.coords)[:-1]]


def split_axis(lo: float, hi: float, tokens: list, fixed: dict[str, tuple[float, float]]) -> list[tuple[str, float, float]]:
    """Cut [lo, hi] into one interval per token. Tokens named in `fixed` get (center, width); the others share the
    remaining stretches equally."""
    out: list[tuple[str, float, float]] = []
    seg: list[str] = []
    cursor = lo

    def flush(a: float, b: float):
        nonlocal seg
        n = len(seg)
        for i, t in enumerate(seg):
            out.append((t, a + (b - a) * i / n, a + (b - a) * (i + 1) / n))
        seg = []

    for t in tokens:
        if t in fixed:
            c, w = fixed[t]
            flush(cursor, c - w / 2)
            out.append((t, c - w / 2, c + w / 2))
            cursor = c + w / 2
        else:
            seg.append(t)
    flush(cursor, hi)
    return out


def main() -> None:
    layout = json.loads((ROOT / "data/campus/campus-layout.json").read_text())
    offices = json.loads((ROOT / "scripts/cad/campus-offices.json").read_text())["buildings"]
    cbuild = {b["number"]: b for b in layout["buildings"] if b.get("footprint")}
    wing_fp = {n: Polygon([(p["x"], p["z"]) for p in cbuild[n]["footprint"]]) for n in (1, 2, 3)}

    # ------------------------------------------------------------------ sky bridges: where the x = BRIDGE_X line meets the walls
    def wall_z(n: int, north: bool) -> float:
        line = LineString([(BRIDGE_X, -500), (BRIDGE_X, 500)])
        hit = wing_fp[n].boundary.intersection(line)
        zs = [p.y for p in getattr(hit, "geoms", [hit])]
        return min(zs) if north else max(zs)

    bridges = [
        {"id": "bridge-3-2", "a": 3, "b": 2, "za": wall_z(3, False), "zb": wall_z(2, True)},
        {"id": "bridge-2-1", "a": 2, "b": 1, "za": wall_z(2, False), "zb": wall_z(1, True)},
    ]
    for br in bridges:
        br["length"] = br["zb"] - br["za"]
        print(f"{br['id']}: {br['length']:.1f} m long")

    # ------------------------------------------------------------------ per-building construction
    buildings, floors, rooms, depts, entrances, facilities, nodes, edges = [], [], [], [], [], [], [], []
    interior_floors = []
    needs_review = []
    node_ix: dict[str, dict] = {}
    edge_ix = [0]

    def add_node(nid, bid, fid, x, y, z, ntype, label=None):
        n = {"id": nid, "buildingId": bid, "floorId": fid, "x": r2(x), "y": r2(y), "z": r2(z), "type": ntype, "label": label, "isDemo": False}
        nodes.append(n)
        node_ix[nid] = n
        return n

    def add_edge(a, b, etype, accessible=False, dist=None):
        na, nb = node_ix[a], node_ix[b]
        d = math.dist((na["x"], na["y"], na["z"]), (nb["x"], nb["y"], nb["z"]))
        if dist is not None:
            d = max(d, dist)
        edge_ix[0] += 1
        edges.append({"id": f"e{edge_ix[0]:03d}", "fromNode": a, "toNode": b, "distance": r2(d + 0.005), "edgeType": etype, "accessible": accessible, "bidirectional": True, "isDemo": False})

    summary = []
    bridge_ends: dict[int, dict] = {}
    for n in (1, 2, 3):
        spec = offices[str(n)]
        plan = PLANS[n]
        fp_w = wing_fp[n]
        fp = to_local(fp_w)
        u0, v0, _, _ = fp.bounds
        bid = f"campus-b{n}"
        f0, f1 = f"{bid}-f0", f"{bid}-f1"
        cb = cbuild[n]
        buildings.append({"id": bid, "name": f"ساختمان {fa(n)}", "slug": f"building-{n}", "description": cb.get("description"), "modelUrl": None, "isActive": True, "isDemo": False})
        floors.append({"id": f0, "buildingId": bid, "floorNumber": 0, "displayName": "همکف", "elevation": 0, "modelUrl": None, "isDemo": False})
        floors.append({"id": f1, "buildingId": bid, "floorNumber": 1, "displayName": "طبقه اول", "elevation": STOREY, "modelUrl": None, "isDemo": False})
        door = (cb.get("doors") or [None])[0]

        def rect(r):
            return box(u0 + r[0], v0 + r[1], u0 + r[2], v0 + r[3])

        def wpt(p):  # local point -> world (x, z)
            q = to_world(Point(p[0], p[1]))
            return q.x, q.y

        # corridors (clipped to the footprint) and their centre lines for the walking graph
        corr_polys = [largest(fp.intersection(rect(r))) for r in plan["corridors"]]
        corr_union = unary_union(corr_polys)
        centre_lines = []
        for g in corr_polys:
            cu0, cv0, cu1, cv1 = g.bounds
            if cu1 - cu0 >= cv1 - cv0:
                centre_lines.append(LineString([(cu0, (cv0 + cv1) / 2), (cu1, (cv0 + cv1) / 2)]))
            else:
                centre_lines.append(LineString([((cu0 + cu1) / 2, cv0), ((cu0 + cu1) / 2, cv1)]))

        # corridor nodes live on a centre line; a node is reused when another one is within 0.4 m along the same line
        line_nodes: list[list[tuple[float, str]]] = [[] for _ in centre_lines]
        counter = [0]

        def corridor_node(li: int, pt, centre_lines=centre_lines, line_nodes=line_nodes, counter=counter, bid=bid, f1=f1, wpt=wpt) -> str:
            line = centre_lines[li]
            t = line.project(pt)
            for tt, nid in line_nodes[li]:
                if abs(tt - t) < 0.4:
                    return nid
            counter[0] += 1
            nid = f"{bid}-c{counter[0]:02d}"
            q = line.interpolate(t)
            x, z = wpt((q.x, q.y))
            add_node(nid, bid, f1, x, STOREY, z, "corridor", "راهرو")
            line_nodes[li].append((t, nid))
            return nid

        def nearest_line(pt, centre_lines=centre_lines) -> int:
            return min(range(len(centre_lines)), key=lambda i: centre_lines[i].distance(pt))

        # corridors that touch are joined at the nearest points of their centre lines
        for i in range(len(centre_lines)):
            for j in range(i + 1, len(centre_lines)):
                if corr_polys[i].distance(corr_polys[j]) > 0.3:
                    continue
                pi, pj = nearest_points(centre_lines[i], centre_lines[j])
                a_, b_ = corridor_node(i, pi), corridor_node(j, pj)
                if a_ != b_:
                    if pi.distance(pj) < 0.05:
                        # the centre lines cross: one shared node instead of a zero-length edge
                        line_nodes[j].append((centre_lines[j].project(pj), a_))
                        line_nodes[j] = [x for x in line_nodes[j] if x[1] != b_]
                    else:
                        add_edge(a_, b_, "corridor")
        # corridor ends (so the 3D route and doors near an end have a node)
        for i, line in enumerate(centre_lines):
            for c in line.coords:
                corridor_node(i, Point(c))
        # walk each line: chain its nodes in order
        def chain_lines(line_nodes=line_nodes):
            done = set()
            for i, lst in enumerate(line_nodes):
                lst.sort()
                for (ta, na_), (tb, nb_) in zip(lst, lst[1:]):
                    if na_ != nb_ and (na_, nb_) not in done:
                        done.add((na_, nb_))
                        add_edge(na_, nb_, "corridor")

        # cells: rooms, lobby
        info = spec["rooms"]
        svc = spec.get("service", {})
        cells = []
        for tok, r in plan["rooms"].items():
            poly = largest(fp.intersection(rect(r)).difference(corr_union))
            cells.append({"tok": tok, "poly": poly})
        if "lobby" in plan:
            cells.append({"tok": "@entrance", "poly": largest(fp.intersection(rect(plan["lobby"])).difference(corr_union))})
        room_records = []
        stair_cell = None
        pending_edges = []
        for c in cells:
            tok, poly = c["tok"], c["poly"]
            if tok == "@entrance":
                kind, number, name = "lobby", "L", f"لابی و راه‌پله ساختمان {fa(n)}"
                rid = f"{bid}-lobby"
            elif tok in svc:
                kind, number, name = svc[tok]["kind"], "", svc[tok]["name"]
                rid = f"{bid}-{tok}"
            else:
                rinfo = info.get(tok, {"names": []})
                number, kind = tok, rinfo.get("kind", "office")
                name = rinfo.get("name") or f"دفتر {fa(tok)}"
                rid = f"{bid}-r{tok}"
            c["rid"], c["kind"], c["number"], c["name"] = rid, kind, number, name
            # the door sits on the wall the room shares with a corridor (the lobby: the wall towards the corridor)
            shared = poly.boundary.intersection(corr_union.buffer(0.12))
            if shared.is_empty:
                print(f"  WARNING {bid} {tok}: no wall shared with a corridor", file=sys.stderr)
                continue
            mid = shared.centroid if not isinstance(shared, Point) else shared
            dpt = poly.boundary.interpolate(poly.boundary.project(mid))
            li = nearest_line(dpt)
            cn = corridor_node(li, dpt)
            cq = centre_lines[li].interpolate(centre_lines[li].project(dpt))
            if dpt.distance(cq) < 0.15:  # keep the door node off the corridor node so the door edge has a length
                cen = poly.representative_point()
                d_ = max(dpt.distance(cen), 1e-9)
                dpt = Point(dpt.x + (cen.x - dpt.x) / d_ * 0.3, dpt.y + (cen.y - dpt.y) / d_ * 0.3)
            dx, dz = wpt((dpt.x, dpt.y))
            dn = f"{bid}-d-{tok.strip('@')}"
            add_node(dn, bid, f1, dx, STOREY, dz, "room-door", name if tok.startswith("@") or tok in svc else f"اتاق {fa(tok)}")
            pending_edges.append((cn, dn, "door"))
            rp = to_world(poly).representative_point()
            c["door_node"], c["corr_node"] = dn, cn
            if tok == "@entrance":
                stair_cell = c
            rooms.append(
                {
                    "id": rid,
                    "floorId": f1,
                    "roomNumber": number if number not in ("", "L") else {"L": "لابی", "": "—"}[number],
                    "name": name,
                    "roomType": kind,
                    "modelObjectId": f"ROOM_{bid.upper().replace('-', '_')}_{tok.strip('@').upper().replace('-', '_')}",
                    "positionX": r2(rp.x),
                    "positionY": STOREY,
                    "positionZ": r2(rp.y),
                    "doorNodeId": dn,
                    "isDemo": False,
                }
            )
            if kind == "restroom":
                facilities.append({"id": f"{bid}-fac-{tok}", "floorId": f1, "facilityType": "restroom", "name": name, "positionX": r2(rp.x), "positionY": STOREY, "positionZ": r2(rp.y), "isDemo": False})
            if tok not in svc and not tok.startswith("@"):
                rinfo = info.get(tok, {"names": []})
                if rinfo.get("names") and rinfo.get("confidence", "low") != "ok":
                    needs_review.append(rid)
                title = rinfo.get("title")
                for i, person in enumerate(rinfo["names"]):
                    full = f"{title} {person}" if title else person
                    kw = [person, *person.split(), tok, fa(tok)] + ([rinfo["field"]] if rinfo.get("field") else [])
                    desc = f"دفتر {fa(tok)}، طبقه اول ساختمان {fa(n)}" + (f" — گروه {rinfo['field']}" if rinfo.get("field") else "")
                    depts.append({"id": f"prof-{bid}-{tok}-{i + 1}", "roomId": rid, "name": full, "slug": f"office-{tok}-{i + 1}", "description": desc, "phone": None, "workingHours": None, "keywords": kw, "isActive": True, "isDemo": False})
            room_records.append(c)

        for a_, b_, t_ in pending_edges:
            add_edge(a_, b_, t_)

        # stairs: outdoor door (ground) -> stair foot -> stair top (lobby) -> corridor
        if door and stair_cell:
            lobby_c = to_world(stair_cell["poly"]).representative_point()
            ent = f"{bid}-entrance"
            add_node(ent, bid, f0, door["x"], 0, door["z"], "entrance", f"ورودی ساختمان {fa(n)}")
            sf = f"{bid}-stair-ground"
            sn = f"{bid}-stair-first"
            add_node(sf, bid, f0, lobby_c.x, 0, lobby_c.y, "stair", f"راه‌پله ساختمان {fa(n)} (همکف)")
            add_node(sn, bid, f1, lobby_c.x, STOREY, lobby_c.y, "stair", f"راه‌پله ساختمان {fa(n)} (طبقه اول)")
            add_edge(ent, sf, "corridor")
            add_edge(sf, sn, "stairs", dist=7.0)
            add_edge(sn, stair_cell["corr_node"], "corridor")
            add_edge(sn, stair_cell["door_node"], "corridor")
            entrances.append({"id": f"entrance-{bid}", "buildingId": bid, "floorId": f0, "name": f"ورودی ساختمان {fa(n)}", "positionX": r2(door["x"]), "positionY": 0, "positionZ": r2(door["z"]), "nodeId": ent, "isDemo": False})
            facilities.append({"id": f"{bid}-fac-stairs", "floorId": f1, "facilityType": "stairs", "name": f"راه‌پله ساختمان {fa(n)}", "positionX": r2(lobby_c.x), "positionY": STOREY, "positionZ": r2(lobby_c.y), "isDemo": False})
            stair_info = {"x": r2(lobby_c.x), "z": r2(lobby_c.y)}
        else:
            stair_info = None

        # where the sky bridges reach this building: the wall point plus the corridor node it joins
        bridge_ends[n] = {"line": nearest_line, "node": corridor_node, "wpt": wpt, "bid": bid, "f1": f1, "u0": u0, "v0": v0, "chain": chain_lines}

        interior_floors.append(
            {
                "floorId": f1,
                "buildingId": bid,
                "elevation": STOREY,
                "height": 3.0,
                "outline": ring(wing_fp[n]),
                "corridors": [ring(to_world(g)) for g in corr_polys if isinstance(g, Polygon)],
                "rooms": [{"roomId": c["rid"], "kind": c["kind"], "number": c["number"], "polygon": ring(to_world(c["poly"]))} for c in room_records],
                "stairs": stair_info,
            }
        )
        widths = sorted(round(math.sqrt(c["poly"].area), 1) for c in room_records)
        summary.append((n, len(room_records), widths[0], widths[-1]))
        for c in room_records:
            if c["poly"].area < 7:
                print(f"  WARNING small cell {bid} {c['tok']}: {c['poly'].area:.1f} m2", file=sys.stderr)
        expected = [t for t in plan["rooms"]]
        missing = [t for t in info if t not in plan["rooms"]]
        if missing:
            print(f"  WARNING {bid}: rooms in campus-offices.json not in the plan: {missing}", file=sys.stderr)

    # ------------------------------------------------------------------ bridges: nodes at the walls, joined to the nearest corridor
    bridge_geo = []
    for br in bridges:
        a, b = br["a"], br["b"]
        pa = f"bridge-{a}-{b}-a"
        pb = f"bridge-{a}-{b}-b"
        add_node(pa, f"campus-b{a}", f"campus-b{a}-f1", BRIDGE_X, STOREY, br["za"], "junction", f"ابتدای پل هوایی (ساختمان {fa(a)})")
        add_node(pb, f"campus-b{b}", f"campus-b{b}-f1", BRIDGE_X, STOREY, br["zb"], "junction", f"انتهای پل هوایی (ساختمان {fa(b)})")
        for n_, pid, z in ((a, pa, br["za"]), (b, pb, br["zb"])):
            be = bridge_ends[n_]
            loc = to_local(Point(BRIDGE_X, z))
            pt = Point(loc.x, loc.y)
            li = be["line"](pt)
            add_edge(be["node"](li, pt), pid, "corridor")
        add_edge(pa, pb, "bridge", dist=br["length"])
        bridge_geo.append(
            {
                "id": br["id"],
                "label": f"پل هوایی ساختمان {fa(a)} به ساختمان {fa(b)}",
                "fromBuildingId": f"campus-b{a}",
                "toBuildingId": f"campus-b{b}",
                "width": BRIDGE_W,
                "elevation": STOREY,
                "height": 3.0,
                "points": [{"x": r2(BRIDGE_X), "z": r2(br["za"])}, {"x": r2(BRIDGE_X), "z": r2(br["zb"])}],
            }
        )

    for be in bridge_ends.values():
        be["chain"]()

    OUT.mkdir(parents=True, exist_ok=True)

    def write(name, data):
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n")

    write("buildings.json", buildings)
    write("floors.json", floors)
    write("rooms.json", rooms)
    write("departments.json", depts)
    write("department-services.json", [])
    write("entrances.json", entrances)
    write("facilities.json", facilities)
    used = {e["fromNode"] for e in edges} | {e["toNode"] for e in edges}
    nodes[:] = [n for n in nodes if n["id"] in used]  # drop nodes merged away at corridor crossings
    write("navigation-nodes.json", nodes)
    write("navigation-edges.json", edges)
    write("interiors.json", {"floors": interior_floors, "bridges": bridge_geo, "needsReview": needs_review})
    print(f"buildings {len(buildings)}, rooms {len(rooms)}, departments {len(depts)}, nodes {len(nodes)}, edges {len(edges)}")
    for n, cnt, lo, hi in summary:
        print(f"  building {n}: {cnt} cells, cell size {lo}..{hi} m (sqrt area)")


if __name__ == "__main__":
    main()
