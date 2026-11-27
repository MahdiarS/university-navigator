#!/usr/bin/env python3
"""
First-floor interiors of campus buildings 1, 2 and 3 + the two sky bridges between them.

Inputs (both committed):
  data/campus/campus-layout.json   building footprints / outdoor doors (from the site plan, see build_campus.py)
  scripts/cad/campus-offices.json  room numbers, names and the order of the rooms (owner's hand-drawn sketches)

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
from shapely.ops import unary_union

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
    for n in (1, 2, 3):
        spec = offices[str(n)]
        fp_w = wing_fp[n]
        fp = to_local(fp_w)
        umin, vmin, umax, vmax = fp.bounds
        bid = f"campus-b{n}"
        f0, f1 = f"{bid}-f0", f"{bid}-f1"
        cb = cbuild[n]
        buildings.append({"id": bid, "name": f"ساختمان {fa(n)}", "slug": f"building-{n}", "description": cb.get("description"), "modelUrl": None, "isActive": True, "isDemo": False})
        floors.append({"id": f0, "buildingId": bid, "floorNumber": 0, "displayName": "همکف", "elevation": 0, "modelUrl": None, "isDemo": False})
        floors.append({"id": f1, "buildingId": bid, "floorNumber": 1, "displayName": "طبقه اول", "elevation": STOREY, "modelUrl": None, "isDemo": False})

        # fixed cells: the stair lobby at the outdoor door, the bridge vestibules at the bridge
        door = (cb.get("doors") or [None])[0]
        bridge_here = [b for b in bridges if n in (b["a"], b["b"])]
        cells: list[dict] = []  # {id, kind, label, poly(local), side, door_axis}
        corridors = []
        door_line: dict[str, tuple[float, float]] = {}  # cell id -> (door point local, corridor point local)

        def cell_poly(rect: Polygon, avoid: list[Polygon]):
            g = fp.intersection(rect)
            for a in avoid:
                g = g.difference(a)
            return largest(g)

        if spec["layout"] == "corridor-two-sides":
            vc = spec.get("corridorV", (vmin + vmax) / 2)
            corr = box(umin - 1, vc - HALF, umax + 1, vc + HALF)
            corridors.append(fp.intersection(corr))
            fixed_n: dict[str, tuple[float, float]] = {}
            fixed_s: dict[str, tuple[float, float]] = {}
            for tok_side, toks, fixed, north in (("north", spec["north"], fixed_n, True), ("south", spec["south"], fixed_s, False)):
                for t in toks:
                    if t == "@entrance" and door:
                        u = to_local(Point(door["x"], door["z"])).x
                        fixed[t] = (u, 4.8)
                    elif t == "@bridge":
                        # the bridge meets this wall on this side iff the building has a bridge to the north/south
                        has = any((b["b"] == n and north) or (b["a"] == n and not north) for b in bridges)
                        if has:
                            u = to_local(Point(BRIDGE_X, (wall_z(n, north)))).x
                            fixed[t] = (u, 4.4)
            for side_name, toks, fixed, v0, v1, north in (
                ("north", spec["north"], fixed_n, vmin - 1, vc - HALF, True),
                ("south", spec["south"], fixed_s, vc + HALF, vmax + 1, False),
            ):
                toks2 = [t for t in toks if not (t.startswith("@") and t not in fixed)]
                for tok, a, b in split_axis(umin - 1, umax + 1, toks2, fixed):
                    poly = cell_poly(box(a, v0, b, v1), [corr])
                    if poly is None:
                        continue
                    uc = (max(a, umin) + min(b, umax)) / 2
                    vedge = v1 if north else v0
                    cells.append({"tok": tok, "poly": poly, "u": uc, "vcorr": vc, "vdoor": vedge, "north": north, "axis": "u"})
            main_len = umax - umin

        # ------------------------------------------------------------------ rooms, departments, nodes, edges
        info = spec["rooms"]
        svc = spec.get("service", {})
        # corridor graph nodes
        stops: dict[str, list] = {}  # corridor-axis position -> node id
        cor_nodes_main: list[tuple[float, str]] = []
        cor_nodes_wing: list[tuple[float, str]] = []

        def corr_node(axis: str, pos: float, key: str, label: str):
            nid = f"{bid}-c-{key}"
            if nid in node_ix:
                return nid
            if axis == "u":
                x, z = pt_world(pos, vc)
                lst = cor_nodes_main
            else:
                x, z = pt_world(wing_info["ucw"], pos)
                lst = cor_nodes_wing
            add_node(nid, bid, f1, x, STOREY, z, "corridor", label)
            lst.append((pos, nid))
            return nid

        room_records = []
        stair_cell = None
        for c in cells:
            tok, poly = c["tok"], c["poly"]
            area = poly.area
            cid = tok
            if tok == "@entrance":
                kind, number, name = "lobby", "L", f"لابی و راه‌پله ساختمان {fa(n)}"
                rid = f"{bid}-lobby"
            elif tok == "@bridge":
                kind, number, name = "hall", "P", "ورودی پل هوایی"
                rid = f"{bid}-bridge-hall-{'n' if c.get('north') else 's'}"
            elif tok in svc:
                kind, number, name = svc[tok]["kind"], "", svc[tok]["name"]
                rid = f"{bid}-{tok}"
            else:
                rinfo = info.get(tok, {"names": []})
                number = tok
                kind = rinfo.get("kind", "office")
                title = rinfo.get("title")
                names = rinfo["names"]
                name = rinfo.get("name") or (f"دفتر {fa(tok)}")
                rid = f"{bid}-r{tok}"
            c["rid"], c["kind"], c["number"], c["name"] = rid, kind, number, name

            # door + corridor nodes
            if c["axis"] == "u":
                uc = c["u"]
                key = f"u{int(round(uc * 10)):05d}"
                cn = corr_node("u", uc, key, "راهرو")
                dx, dz = pt_world(uc, c["vdoor"])
                dn = f"{bid}-d-{tok.strip('@')}{'-n' if c.get('north') else '-s'}"
            else:
                vv = c["v"]
                key = f"w{int(round(vv * 10)):05d}"
                cn = corr_node("v", vv, key, "راهرو")
                dx, dz = pt_world(c["udoor"], vv)
                dn = f"{bid}-d-{tok}"
            add_node(dn, bid, f1, dx, STOREY, dz, "room-door", name if tok.startswith("@") or tok in svc else f"اتاق {fa(tok)}")
            add_edge(cn, dn, "door")
            rp = to_world(poly).representative_point()
            c["door_node"] = dn
            c["corr_node"] = cn
            if tok == "@entrance":
                stair_cell = c
            rooms.append(
                {
                    "id": rid,
                    "floorId": f1,
                    "roomNumber": number if number not in ("", "L", "P") else {"L": "لابی", "P": "پل", "": "—"}[number],
                    "name": name,
                    "roomType": kind,
                    "modelObjectId": f"ROOM_{bid.upper().replace('-', '_')}_{tok.strip('@').upper().replace('-', '_')}{'_' + ('N' if c.get('north') else 'S') if tok == '@bridge' else ''}",
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

        # corridor ends + chain the corridor nodes
        def chain(lst, axis):
            lst.sort()
            for (pa, na_), (pb, nb_) in zip(lst, lst[1:]):
                if na_ != nb_:
                    add_edge(na_, nb_, "corridor")

        chain(cor_nodes_main, "u")

        # stairs: outdoor door (ground) -> stair foot -> stair top (lobby) -> corridor
        if door and stair_cell:
            lx, lz = pt_world(stair_cell["u"], stair_cell["vcorr"] + (stair_cell["vdoor"] - stair_cell["vcorr"]) * 2.2)
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

        interior_floors.append(
            {
                "floorId": f1,
                "buildingId": bid,
                "elevation": STOREY,
                "height": 3.0,
                "outline": ring(wing_fp[n]),
                "corridors": [ring(to_world(g)) for p in corridors for g in ([p] if isinstance(p, Polygon) else list(p.geoms)) if isinstance(g, Polygon)],
                "rooms": [{"roomId": c["rid"], "kind": c["kind"], "number": c["number"], "polygon": ring(to_world(c["poly"]))} for c in room_records],
                "stairs": stair_info,
            }
        )
        widths = sorted(round(math.sqrt(c["poly"].area), 1) for c in room_records)
        summary.append((n, len(room_records), widths[0], widths[-1]))
        for c in room_records:
            if c["poly"].area < 7:
                print(f"  WARNING small cell {bid} {c['tok']}: {c['poly'].area:.1f} m2", file=sys.stderr)

    # ------------------------------------------------------------------ bridges: nodes at the walls and edges between the vestibules
    bridge_geo = []
    for br in bridges:
        a, b = br["a"], br["b"]
        ha = next(r for r in rooms if r["id"] == f"campus-b{a}-bridge-hall-s")
        hb = next(r for r in rooms if r["id"] == f"campus-b{b}-bridge-hall-n")
        pa = f"bridge-{a}-{b}-a"
        pb = f"bridge-{a}-{b}-b"
        add_node(pa, f"campus-b{a}", f"campus-b{a}-f1", BRIDGE_X, STOREY, br["za"], "junction", f"ابتدای پل هوایی (ساختمان {fa(a)})")
        add_node(pb, f"campus-b{b}", f"campus-b{b}-f1", BRIDGE_X, STOREY, br["zb"], "junction", f"انتهای پل هوایی (ساختمان {fa(b)})")
        add_edge(ha["doorNodeId"], pa, "corridor")
        add_edge(pa, pb, "bridge", dist=br["length"])
        add_edge(pb, hb["doorNodeId"], "corridor")
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
    write("navigation-nodes.json", nodes)
    write("navigation-edges.json", edges)
    write("interiors.json", {"floors": interior_floors, "bridges": bridge_geo, "needsReview": needs_review})
    print(f"buildings {len(buildings)}, rooms {len(rooms)}, departments {len(depts)}, nodes {len(nodes)}, edges {len(edges)}")
    for n, cnt, lo, hi in summary:
        print(f"  building {n}: {cnt} cells, cell size {lo}..{hi} m (sqrt area)")


if __name__ == "__main__":
    main()
