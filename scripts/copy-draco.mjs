#!/usr/bin/env node
/**
 * Copies the Draco decoder that ships with three.js into public/draco/ so compressed GLB models can be decoded
 * from our own origin (no CDN request). Runs automatically before `dev` and `build`. The target folder is
 * git-ignored because it is derived from node_modules.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "three", "examples", "jsm", "libs", "draco", "gltf");
const to = join(root, "public", "draco");
const files = ["draco_decoder.js", "draco_decoder.wasm", "draco_wasm_wrapper.js"];

if (!existsSync(from)) {
  console.warn("[copy-draco] three.js Draco decoder not found; skipping (uncompressed GLB files still work).");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`[copy-draco] copied ${files.length} decoder files to public/draco/`);
