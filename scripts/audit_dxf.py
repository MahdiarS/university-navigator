#!/usr/bin/env python3
"""
audit_dxf.py - read-only audit of AutoCAD DXF drawings for University Navigator.

Usage:
    python3 scripts/audit_dxf.py <file-or-dir> [<file-or-dir> ...] [-o docs/cad-audit-report.md]

What it does
    * Opens every DXF file READ-ONLY (ezdxf.readfile never modifies the original).
    * Reports DXF version, $INSUNITS, layers (with entity counts), entity types, modelspace
      extents, block count, TEXT/MTEXT samples and which recommended layers exist.
    * Emits warnings about things that need a human decision.

What it deliberately does NOT do
    * It never guesses floor heights, real-world dimensions or room identities. Units are
      reported as declared in the file; "unknown / unitless" is stated when the file does not say.
      Text samples are shown verbatim and are NOT interpreted as verified room numbers.

Output is Markdown (stdout, or the file given with -o). The output path must not be inside
input-assets/cad/ so original drawings are never touched or polluted.

Requires: ezdxf (pip install ezdxf). DWG files are not read directly: convert DWG -> DXF first
(see docs/cad-import-guide.md).
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

try:
    import ezdxf
    from ezdxf import bbox as ezbbox
except ImportError:  # pragma: no cover - exercised only without ezdxf
    sys.stderr.write(
        "ERROR: the 'ezdxf' package is required.\n"
        "Install it with:  pip install ezdxf   (or: pip install --break-system-packages ezdxf)\n"
    )
    raise SystemExit(2)

RECOMMENDED_LAYERS = [
    "WALL", "DOOR", "WINDOW", "COLUMN", "STAIR",
    "ELEVATOR", "ROOM", "CORRIDOR", "ENTRANCE", "TEXT",
]
TEXT_LAYERS = {"TEXT", "ROOM"}
TEXT_SAMPLE_LIMIT = 15
FAR_FROM_ORIGIN = 1e6

# DXF $INSUNITS codes (subset names per the DXF reference). 0 = unitless.
INSUNITS = {
    0: "Unitless", 1: "Inches", 2: "Feet", 3: "Miles", 4: "Millimeters", 5: "Centimeters",
    6: "Meters", 7: "Kilometers", 8: "Microinches", 9: "Mils", 10: "Yards", 11: "Angstroms",
    12: "Nanometers", 13: "Microns", 14: "Decimeters", 15: "Decameters", 16: "Hectometers",
    17: "Gigameters", 18: "Astronomical units", 19: "Light years", 20: "Parsecs",
}


def find_dxf_files(inputs: list[str]) -> tuple[list[Path], list[str]]:
    """Expand files/directories into a sorted, de-duplicated list of .dxf paths."""
    found: dict[Path, None] = {}
    notes: list[str] = []
    for raw in inputs:
        p = Path(raw)
        if p.is_dir():
            for f in sorted(p.rglob("*")):
                if f.is_file() and f.suffix.lower() == ".dxf":
                    found[f.resolve()] = None
        elif p.is_file():
            if p.suffix.lower() == ".dxf":
                found[p.resolve()] = None
            elif p.suffix.lower() == ".dwg":
                notes.append(f"`{p}` is a DWG: convert it to DXF first (see docs/cad-import-guide.md); skipped.")
            else:
                notes.append(f"`{p}` is not a .dxf file; skipped.")
        else:
            notes.append(f"`{p}` does not exist; skipped.")
    return list(found), notes


def is_inside_cad_inputs(path: Path) -> bool:
    """True when path is inside any input-assets/cad directory (originals must stay untouched)."""
    parts = [x.lower() for x in path.resolve().parts]
    return any(parts[i] == "input-assets" and parts[i + 1] == "cad" for i in range(len(parts) - 1))


def fmt(n: float) -> str:
    return f"{n:,.3f}".rstrip("0").rstrip(".")


def md_escape(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ").replace("\r", " ")


def entity_text(e) -> str:
    try:
        if e.dxftype() == "MTEXT":
            return e.plain_text()
        return str(e.dxf.text)
    except Exception:
        return ""


def entity_z_values(e) -> list[float]:
    """Z coordinates an entity declares explicitly (used only to warn about non-planar data)."""
    zs: list[float] = []
    try:
        t = e.dxftype()
        if t == "LINE":
            zs += [e.dxf.start.z, e.dxf.end.z]
        elif t in ("CIRCLE", "ARC", "TEXT", "MTEXT", "INSERT", "POINT"):
            attr = "insert" if t in ("TEXT", "MTEXT", "INSERT") else ("center" if t != "POINT" else "location")
            zs.append(getattr(e.dxf, attr).z)
        elif t == "LWPOLYLINE":
            zs.append(e.dxf.elevation if e.dxf.hasattr("elevation") else 0.0)
            # elevation may be a vec3 in some versions
    except Exception:
        pass
    out = []
    for z in zs:
        try:
            out.append(float(z[2]) if hasattr(z, "__getitem__") else float(z))
        except Exception:
            pass
    return out


def audit_file(path: Path) -> dict:
    """Return an audit dict for one DXF; on failure return {'error': ...}."""
    info: dict = {"path": path, "size": path.stat().st_size}
    try:
        doc = ezdxf.readfile(str(path))  # read-only: we never call save()
    except (IOError, ezdxf.DXFStructureError) as exc:
        info["error"] = f"cannot read DXF: {type(exc).__name__}: {exc}"
        return info
    except Exception as exc:  # corrupt or unexpected content
        info["error"] = f"unexpected error while reading: {type(exc).__name__}: {exc}"
        return info

    try:
        msp = doc.modelspace()
        info["version"] = f"{doc.dxfversion} ({doc.acad_release})"
        insunits = doc.header.get("$INSUNITS", None)
        info["insunits_code"] = insunits
        info["measurement"] = doc.header.get("$MEASUREMENT", None)

        layer_entities: Counter = Counter()
        type_counts: Counter = Counter()
        text_samples: list[tuple[str, str, str]] = []
        z_nonzero = 0
        for e in msp:
            layer = str(e.dxf.layer) if e.dxf.hasattr("layer") else "0"
            layer_entities[layer] += 1
            t = e.dxftype()
            type_counts[t] += 1
            if t in ("TEXT", "MTEXT") and layer.upper() in TEXT_LAYERS and len(text_samples) < TEXT_SAMPLE_LIMIT:
                txt = entity_text(e).strip()
                if txt:
                    text_samples.append((layer, t, txt[:80]))
            if any(abs(z) > 1e-9 for z in entity_z_values(e)):
                z_nonzero += 1

        defined_layers = {l.dxf.name for l in doc.layers}
        info["defined_layers"] = sorted(defined_layers, key=str.lower)
        info["layer_entities"] = layer_entities
        info["type_counts"] = type_counts
        info["entity_total"] = sum(type_counts.values())
        info["text_samples"] = text_samples
        info["z_nonzero"] = z_nonzero
        info["blocks"] = [b.name for b in doc.blocks if not b.name.startswith("*")]
        info["block_total"] = len(list(doc.blocks))

        try:
            box = ezbbox.extents(msp, fast=True)
            info["extents"] = (box.extmin, box.extmax) if box.has_data else None
        except Exception as exc:
            info["extents"] = None
            info["extents_error"] = f"{type(exc).__name__}: {exc}"
    except Exception as exc:
        info["error"] = f"audit failed: {type(exc).__name__}: {exc}"
    return info


def warnings_for(info: dict) -> list[str]:
    w: list[str] = []
    code = info.get("insunits_code")
    if code is None:
        w.append("`$INSUNITS` is not set in the header: drawing units are unknown. Confirm the unit with the drawing owner; do not assume.")
    elif code == 0:
        w.append("`$INSUNITS` = 0 (unitless): drawing units are unknown. Confirm the unit with the drawing owner; do not assume.")
    ext = info.get("extents")
    if ext:
        lo, hi = ext
        if max(abs(lo.x), abs(lo.y), abs(hi.x), abs(hi.y)) > FAR_FROM_ORIGIN:
            w.append(f"Geometry lies very far from the origin (> {fmt(FAR_FROM_ORIGIN)} drawing units). Re-base the origin before export to avoid float precision problems; floors must share one origin.")
    elif info.get("entity_total", 0) > 0:
        w.append("Extents could not be computed" + (f" ({info['extents_error']})" if info.get("extents_error") else "") + ".")
    if info.get("z_nonzero", 0):
        w.append(f"{info['z_nonzero']} entities declare a non-zero Z coordinate. The drawing may not be a flat 2D plan; floor elevations must come from the building owner, not from this data.")
    empty = [l for l in info.get("defined_layers", []) if info["layer_entities"].get(l, 0) == 0 and l != "0"]
    if empty:
        w.append("Empty layers (defined, no modelspace entities): " + ", ".join(f"`{l}`" for l in empty))
    undefined = [l for l in info["layer_entities"] if l not in info.get("defined_layers", [])]
    if undefined:
        w.append("Entities reference layers missing from the layer table: " + ", ".join(f"`{l}`" for l in undefined))
    if info.get("entity_total", 0) == 0:
        w.append("Modelspace is empty.")
    return w


def render_file(info: dict) -> list[str]:
    out: list[str] = [f"## `{info['path'].name}`", "", f"- Path: `{info['path']}`", f"- Size: {info['size']:,} bytes"]
    if "error" in info:
        out += [f"- **Status: could not be audited** - {info['error']}", ""]
        return out

    code = info.get("insunits_code")
    if code in (None, 0):
        units = "unknown / unitless (not declared by the file)"
    else:
        units = f"{INSUNITS.get(code, 'unrecognised code')} (code {code}, as declared in the header)"
    out += [
        f"- DXF version: {info['version']}",
        f"- Declared units (`$INSUNITS`): {units}",
        f"- Modelspace entities: {info['entity_total']:,}",
        f"- Block definitions (excluding anonymous `*` blocks): {len(info['blocks'])} (total incl. system blocks: {info['block_total']})",
    ]
    ext = info.get("extents")
    if ext:
        lo, hi = ext
        out.append(
            f"- Modelspace extents (drawing units): min ({fmt(lo.x)}, {fmt(lo.y)}, {fmt(lo.z)}) "
            f"max ({fmt(hi.x)}, {fmt(hi.y)}, {fmt(hi.z)}); span {fmt(hi.x - lo.x)} x {fmt(hi.y - lo.y)} "
            "(approximate: text/MTEXT bounds are estimated by ezdxf)"
        )
    else:
        out.append("- Modelspace extents: not available")
    out.append("")

    out += ["### Layers", "", "| Layer | Entities |", "|---|---:|"]
    names = sorted(set(info["defined_layers"]) | set(info["layer_entities"]), key=str.lower)
    for n in names:
        out.append(f"| `{md_escape(n)}` | {info['layer_entities'].get(n, 0):,} |")
    out.append("")

    present = {n.upper() for n in names}
    ok = [l for l in RECOMMENDED_LAYERS if l in present]
    missing = [l for l in RECOMMENDED_LAYERS if l not in present]
    out += [
        "### Recommended layers (case-insensitive match)",
        "",
        "- Present: " + (", ".join(f"`{l}`" for l in ok) or "none"),
        "- Missing: " + (", ".join(f"`{l}`" for l in missing) or "none"),
        "",
        "### Entity types",
        "",
        "| Type | Count |",
        "|---|---:|",
    ]
    for t, c in info["type_counts"].most_common():
        out.append(f"| {t} | {c:,} |")
    out.append("")

    out += [f"### Text samples on layers TEXT / ROOM (first {TEXT_SAMPLE_LIMIT}, verbatim, NOT verified room identities)", ""]
    if info["text_samples"]:
        out += ["| Layer | Type | Text |", "|---|---|---|"]
        out += [f"| `{md_escape(l)}` | {t} | {md_escape(s)} |" for l, t, s in info["text_samples"]]
    else:
        out.append("None found.")
    out.append("")

    out += ["### Warnings", ""]
    ws = warnings_for(info)
    out += [f"- {w}" for w in ws] if ws else ["- None."]
    out.append("")
    return out


def build_report(files: list[Path], notes: list[str]) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    out = ["# CAD audit report", "", f"Generated: {stamp} by `scripts/audit_dxf.py` (read-only; originals are never modified).", ""]
    if notes:
        out += ["## Notes", ""] + [f"- {n}" for n in notes] + [""]
    if not files:
        out += [
            "**No CAD files present.**",
            "",
            "No `.dxf` files were found. Place exported DXF files under `input-assets/cad/building-01/` "
            "(they are git-ignored by default) and re-run `python3 scripts/audit_dxf.py input-assets/cad -o docs/cad-audit-report.md`. "
            "The application keeps using the procedural demo building until real models are supplied.",
            "",
        ]
        return "\n".join(out)

    out += [
        "This report states only what is in the files. Floor heights, real-world dimensions and room "
        "identities are not inferred; confirm them with the drawing owner.",
        "",
        "## Summary",
        "",
        "| File | Version | Units | Entities | Layers |",
        "|---|---|---|---:|---:|",
    ]
    infos = [audit_file(f) for f in files]
    for i in infos:
        if "error" in i:
            out.append(f"| `{i['path'].name}` | - | - | - | error |")
            continue
        code = i.get("insunits_code")
        u = "unknown" if code in (None, 0) else INSUNITS.get(code, f"code {code}")
        out.append(f"| `{i['path'].name}` | {i['version']} | {u} | {i['entity_total']:,} | {len(i['defined_layers'])} |")
    out.append("")
    for i in infos:
        out += render_file(i)
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Read-only audit of DXF drawings (Markdown report).")
    ap.add_argument("inputs", nargs="*", default=["input-assets/cad"], help="DXF files or directories (default: input-assets/cad)")
    ap.add_argument("-o", "--output", help="write the Markdown report here (default: stdout)")
    args = ap.parse_args(argv)

    out_path = Path(args.output) if args.output else None
    if out_path and is_inside_cad_inputs(out_path):
        sys.stderr.write("ERROR: refusing to write the report inside input-assets/cad (originals must stay untouched).\n")
        return 2

    files, notes = find_dxf_files(args.inputs)
    report = build_report(files, notes)

    if out_path:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")
        print(f"Report written to {out_path} ({len(files)} DXF file(s) audited).")
    else:
        print(report)
    if not files:
        sys.stderr.write("No DXF files found. See the report for next steps.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
