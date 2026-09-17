import { readFileSync } from "node:fs";
const design = readFileSync("DESIGN_SYSTEM.md", "utf8");
const forbidden = ["gradient", "glassmorphism", "rainbow"];
for (const token of forbidden) if (design.toLowerCase().includes(token)) throw new Error(`Forbidden visual token detected in design system: ${token}`);
const cssFiles = ["apps/web/src/app/os/platform/platform.css"];
for (const file of cssFiles) { const css = readFileSync(file, "utf8"); if (!css.includes("var(--color-acid-500)") || !css.includes("max-width:768px")) throw new Error(`Visual contract missing in ${file}`); }
console.log("Visual regression contract: OK");
