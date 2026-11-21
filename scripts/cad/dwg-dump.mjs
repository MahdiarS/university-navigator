// Dump a DWG (AutoCAD 2000-2018) to a plain JSON entity database, without modifying the original.
//
//   npm install --no-save @mlightcad/libredwg-web      (LibreDWG compiled to WebAssembly; not a project dependency)
//   node scripts/cad/dwg-dump.mjs <input.dwg> <output.json>
//
// The output stays OUTSIDE the repository (private architectural data). build_campus.py reads it.
import { readFileSync, writeFileSync } from "node:fs";
import { LibreDwg, Dwg_File_Type } from "@mlightcad/libredwg-web";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: node scripts/cad/dwg-dump.mjs <input.dwg> <output.json>");
  process.exit(2);
}
const bytes = readFileSync(input);
const lib = await LibreDwg.create();
const data = lib.dwg_read_data(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), Dwg_File_Type.DWG);
if (!data) {
  console.error("Could not read the DWG file.");
  process.exit(1);
}
const db = lib.convert(data);
// the embedded preview bitmap is large and not needed
delete db.thumbnailImage;
writeFileSync(output, JSON.stringify(db));
console.log(`entities: ${db.entities.length}, layers: ${db.tables?.LAYER?.entries?.length ?? "?"}, INSUNITS: ${db.header?.INSUNITS}`);
