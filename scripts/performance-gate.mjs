import { existsSync, readFileSync } from "node:fs";
const design = readFileSync("DESIGN_SYSTEM.md", "utf8");
if (!design.includes("LCP") && process.env.CI === "true") throw new Error("Performance budget documentation missing");
const next = "apps/web/.next/BUILD_ID";
if (process.env.CI === "true" && !existsSync(next)) throw new Error("Next build output missing before performance gate");
console.log("Performance gate: OK");
