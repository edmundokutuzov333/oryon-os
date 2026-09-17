import { spawnSync } from "node:child_process";
const result = spawnSync("pnpm", ["audit", "--prod", "--audit-level=high"], { stdio: "inherit", shell: process.platform === "win32" });
if (result.error) throw result.error;
if ((result.status ?? 1) !== 0) throw new Error("Dependency security audit failed at high severity or above");
console.log("Security audit: OK");
