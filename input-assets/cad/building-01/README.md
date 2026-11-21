# input-assets/cad/building-01

Place the **AutoCAD source drawings** of the pilot building here:

- `building-01-original.dwg` — the untouched original (never edit it)
- `floor-00.dxf`, `floor-01.dxf`, `floor-02.dxf`, … — one DXF per floor (see `docs/cad-import-guide.md`)

Recommended DXF layers: `WALL`, `DOOR`, `WINDOW`, `COLUMN`, `STAIR`, `ELEVATOR`, `ROOM`, `CORRIDOR`, `ENTRANCE`, `TEXT`.

## Confidentiality

`*.dwg`, `*.dxf` and `*.bak` files in `input-assets/cad/` are **git-ignored by default** (see `.gitignore`). They are private architectural drawings: do **not** force-add, commit or push them — even to a private repository — unless the drawing owner has explicitly approved it. Only this README is tracked.

## Audit

After copying files here, run (requires Python 3 and `pip install ezdxf`):

```bash
python3 scripts/audit_dxf.py input-assets/cad/building-01 -o docs/cad-audit-report.md
```

The report lists layers, entity counts, extents and units. It reads the files without modifying them.

Currently this folder contains no drawings; the app uses a procedural demo building.
