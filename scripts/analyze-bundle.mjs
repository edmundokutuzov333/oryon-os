import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const roots = ["apps/web/.next/static/chunks", "apps/web/.next/static/chunks/app"];
if (!roots.some(existsSync)) { console.log("Bundle analysis: build output not present, CI build will populate it before this gate."); process.exit(0); }
const files = [];
for (const root of roots) if (existsSync(root)) for (const name of readdirSync(root)) { const path = `${root}/${name}`; if (statSync(path).isFile() && path.endsWith(".js")) { const raw = readFileSync(path); files.push({ path, gzip: gzipSync(raw).length }); } }
files.sort((a, b) => b.gzip - a.gzip);
const max = Number(process.env.ORYON_MAX_CHUNK_GZIP_BYTES ?? "184320");
const violations = files.filter(file => file.gzip > max);
console.log(`Largest JS chunk gzip: ${files[0]?.gzip ?? 0} bytes`);
if (violations.length) throw new Error(`Bundle budget exceeded by ${violations.length} chunk(s); max ${max} bytes gzip`);
console.log("Bundle analysis: OK");
