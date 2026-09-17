import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const run = (command, args = [], options = {}) => execFileSync(command, args, { encoding: "utf8", stdio: options.stdio ?? "pipe", ...options }).trimEnd();
const runRaw = (command, args = [], options = {}) => execFileSync(command, args, { encoding: "utf8", ...options });
const repo = process.cwd();
const P12 = "origin/feat/phase-12-search-ai";
const P13 = "origin/feat/phase-13-agents-automation";
const P15 = "origin/feat/phase-15-platform-release";
const MAIN_BASE = "14ad4ca34915ed772b7a49ef4989c4c6147a0aa6";
const P12_BASE = "df812c3a2fe9fd4a15cbffd4ed5ab1bc2bf4de5f";
const mainCiPath = ".github/workflows/ci.yml";
const mainCiContent = existsSync(mainCiPath) ? readFileSync(mainCiPath, "utf8") : null;

const show = (ref, path) => run("git", ["show", `${ref}:${path}`]);
const changed = (base, ref) => run("git", ["diff", "--name-status", base, ref]).split("\n").filter(Boolean).map((line) => {
  const [status, ...parts] = line.split("\t");
  return { status, path: parts.join("\t") };
});

const p15Changed = new Set(changed(MAIN_BASE, P15).map((item) => item.path));
const p12Changed = changed(P12_BASE, P12);
const p13Changed = changed(P12_BASE, P13);

run("git", ["fetch", "origin", "main", "refs/heads/feat/phase-12-search-ai", "refs/heads/feat/phase-13-agents-automation", "refs/heads/feat/phase-15-platform-release"], { stdio: "inherit" });
run("git", ["checkout", "--detach", P15], { stdio: "inherit" });
if (mainCiContent !== null) writeFileSync(mainCiPath, mainCiContent);

const collisionPaths = new Set([
  ".env.example",
  "apps/api/package.json",
  "apps/api/src/server.ts",
  "apps/web/src/app/os/OryonAppShell.tsx",
  "packages/ai/src/gateway.test.ts",
  "packages/ai/src/index.ts",
  "packages/contracts/package.json",
  "packages/db/prisma/schema.prisma",
  "packages/db/src/repositories/index.ts",
  "pnpm-lock.yaml",
]);

const copyChanges = (items, ref) => {
  for (const { status, path } of items) {
    if (collisionPaths.has(path)) continue;
    if (status === "A" || (status === "M" && !p15Changed.has(path))) {
      run("git", ["checkout", ref, "--", path], { stdio: "inherit" });
    }
  }
};
copyChanges(p12Changed, P12);
copyChanges(p13Changed, P13);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const mergePackageJson = (path, refs) => {
  const current = readJson(path);
  for (const ref of refs) {
    try {
      const incoming = JSON.parse(show(ref, path));
      for (const key of ["scripts", "dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        if (!incoming[key]) continue;
        current[key] ??= {};
        for (const [name, value] of Object.entries(incoming[key])) current[key][name] ??= value;
      }
      if (incoming.exports && current.exports) {
        for (const [name, value] of Object.entries(incoming.exports)) current.exports[name] ??= value;
      }
    } catch {}
  }
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
};

mergePackageJson("apps/api/package.json", [P12, P13]);
mergePackageJson("apps/worker/package.json", [P13]);
mergePackageJson("packages/contracts/package.json", [P12, P13]);

const rootPackage = readJson("package.json");
const p13Root = JSON.parse(show(P13, "package.json"));
rootPackage.scripts ??= {};
for (const [name, value] of Object.entries(p13Root.scripts ?? {})) rootPackage.scripts[name] ??= value;
rootPackage.scripts.verify = rootPackage.scripts.verify.includes("pnpm check:phase13")
  ? rootPackage.scripts.verify
  : rootPackage.scripts.verify.replace("pnpm check:v1 && ", "pnpm check:v1 && pnpm check:phase13 && ");
if (typeof rootPackage.scripts["infra:up"] === "string" && !rootPackage.scripts["infra:up"].includes(" temporal")) {
  rootPackage.scripts["infra:up"] = rootPackage.scripts["infra:up"].replace(" livekit", " livekit temporal");
}
writeFileSync("package.json", `${JSON.stringify(rootPackage, null, 2)}\n`);

const envPath = ".env.example";
const envLines = readFileSync(envPath, "utf8").split("\n");
const envKeys = new Set(envLines.filter((line) => line && !line.trimStart().startsWith("#") && line.includes("=")).map((line) => line.split("=", 1)[0]));
for (const ref of [P12, P13]) {
  const incoming = show(ref, envPath).split("\n");
  for (const line of incoming) {
    if (!line || line.trimStart().startsWith("#") || !line.includes("=")) continue;
    const key = line.split("=", 1)[0];
    if (key.startsWith("ORYON_") && !envKeys.has(key)) {
      envLines.push(line);
      envKeys.add(key);
    }
  }
}
writeFileSync(envPath, `${envLines.join("\n").replace(/\n+$/, "")}\n`);

const repoIndexPath = "packages/db/src/repositories/index.ts";
const repoIndex = readFileSync(repoIndexPath, "utf8").split("\n").filter(Boolean);
const repoExports = new Set(repoIndex);
for (const ref of [P12, P13]) {
  const incoming = show(ref, repoIndexPath).split("\n");
  for (const line of incoming) {
    if (line.startsWith("export ") && !repoExports.has(line)) {
      repoIndex.push(line);
      repoExports.add(line);
    }
  }
}
writeFileSync(repoIndexPath, `${repoIndex.join("\n")}\n`);

writeFileSync("packages/ai/src/index.ts", `export const ORYON_AI_VERSION = "0.2.0" as const;\nexport { answerWithSources, createEmbedding, extractCitationIds, gatewayConfig, resolveModel } from "./gateway.js";\nexport type { AiGatewayConfig, AiPolicy, ChatSource } from "./gateway.js";\nexport { executeAgentRun, executeAgentTool, rollbackAgentRun, validateAgentBudget } from "./agent-runtime.js";\nexport type { AgentExecutionResult } from "./agent-runtime.js";\n`);
writeFileSync("packages/ai/src/gateway.test.ts", `import { describe, expect, it } from "vitest";\nimport { extractCitationIds, resolveModel } from "./gateway.js";\n\ndescribe("AI gateway", () => {\n  it("prefers an allowed requested model", () => {\n    expect(resolveModel({ allowedModels: ["gpt-test"], fallbackModel: "fallback", maxClassification: null, residencyRegion: null, monthlyCapCents: null, routingRules: null }, "gpt-test")).toBe("gpt-test");\n  });\n  it("extracts unique citation identifiers", () => {\n    expect(extractCitationIds("Fact [page:1] and again [page:1] plus [work_object:2]")).toEqual(["page:1", "work_object:2"]);\n  });\n});\n`);

const serverPath = "apps/api/src/server.ts";
let server = readFileSync(serverPath, "utf8");
if (!server.includes("registerSearchAiRoutes")) {
  const marker = 'import { registerPlatformRoutes } from "./platform.js";';
  if (!server.includes(marker)) throw new Error("Platform route import not found while centralizing Search + AI");
  server = server.replace(marker, `${marker}\nimport { registerSearchAiRoutes, closeAiSearchResources } from "./search-ai.js";`);
  server = server.replace("await registerPlatformRoutes(app);", "await registerPlatformRoutes(app);\nawait registerSearchAiRoutes(app);");
  server = server.replace("await io.close(); await closePrisma(); process.exitCode = 1;", "await io.close(); await closeAiSearchResources(); await closePrisma(); process.exitCode = 1;");
  server = server.replace("await io.close(); await app.close(); await closePrisma(); });", "await io.close(); await closeAiSearchResources(); await app.close(); await closePrisma(); });");
}
if (!server.includes("registerAgentAutomationRoutes")) {
  const marker = 'import { registerSearchAiRoutes, closeAiSearchResources } from "./search-ai.js";';
  server = server.replace(marker, `${marker}\nimport { registerAgentAutomationRoutes } from "./agents.js";`);
  server = server.replace("await registerSearchAiRoutes(app);", "await registerSearchAiRoutes(app);\nawait registerAgentAutomationRoutes(app);");
}
writeFileSync(serverPath, server);

const shellPath = "apps/web/src/app/os/OryonAppShell.tsx";
let shell = readFileSync(shellPath, "utf8");
if (!shell.includes('/os/search')) shell = shell.replace('{ href: "/os/work", label: "Work" },', '{ href: "/os/work", label: "Work" },\n  { href: "/os/search", label: "Search + AI" },');
if (!shell.includes('/os/agents')) shell = shell.replace('{ href: "/os/search", label: "Search + AI" },', '{ href: "/os/search", label: "Search + AI" },\n  { href: "/os/agents", label: "Agents" },');
if (!shell.includes('/os/automations')) shell = shell.replace('{ href: "/os/agents", label: "Agents" },', '{ href: "/os/agents", label: "Agents" },\n  { href: "/os/automations", label: "Automations" },');
writeFileSync(shellPath, shell);

const schema = "packages/db/prisma/schema.prisma";
const schemaBase = "/tmp/oryon-schema-base.prisma";
const schemaP12 = "/tmp/oryon-schema-p12.prisma";
const schemaCurrent = "/tmp/oryon-schema-current.prisma";
writeFileSync(schemaBase, show(P12_BASE, schema));
writeFileSync(schemaP12, show(P12, schema));
writeFileSync(schemaCurrent, readFileSync(schema, "utf8"));
const mergedSchema = runRaw("git", ["merge-file", "-p", schemaCurrent, schemaBase, schemaP12]);
if (mergedSchema.includes("<<<<<<<")) throw new Error("Prisma schema conflict while centralizing Phase 12");
writeFileSync(schema, mergedSchema);

run("pnpm", ["install", "--lockfile-only", "--no-frozen-lockfile"], { stdio: "inherit" });
if (existsSync(".github/workflows/centralize-v1-on-main.yml")) unlinkSync(".github/workflows/centralize-v1-on-main.yml");

run("git", ["add", "-A"]);
const staged = run("git", ["diff", "--cached", "--name-only"]);
if (!staged) {
  console.log("OryonOS V1 is already centralized on main.");
  process.exit(0);
}
run("git", ["commit", "-m", "chore(main): centralize OryonOS V1 [centralize-v1]"], { stdio: "inherit" });
run("git", ["push", "origin", "HEAD:main"], { stdio: "inherit" });
