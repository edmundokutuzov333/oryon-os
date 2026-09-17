import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const sdk = read("sdk/src/index.ts");
const openapi = read("apps/api/src/openapi.ts");
const claude = read("CLAUDE.md");
const schema = read("packages/db/prisma/schema.prisma");

const requiredFiles = [
	"docs/ADR-0015-rest-openapi-canonical-contract.md",
	"packages/contracts/src/openapi.ts",
	"scripts/db-validate.mjs",
	"sdk/tsconfig.json",
	"apps/api/src/openapi.ts",
];
for (const file of requiredFiles)
	if (!existsSync(file)) throw new Error(`Missing canonical contract file: ${file}`);

for (const token of [
	"REST + OpenAPI 3.1 é o contrato externo canónico",
	"tRPC não faz parte da arquitectura V1",
	"packages/contracts",
]) {
	if (!claude.includes(token)) throw new Error(`Architecture contract missing: ${token}`);
}

if (/(@trpc\/|trpc)/i.test(sdk)) throw new Error("tRPC residue detected in SDK");
if (sdk.includes("Promise<unknown>")) throw new Error("Public SDK method exposes unknown");
if (!sdk.includes('from "@oryon/contracts/platform-release"'))
	throw new Error("SDK is not typed from canonical platform contracts");

const requiredPaths = [
	"/platform/health",
	"/platform/api-keys",
	"/platform/api-keys/{id}",
	"/platform/webhooks",
	"/platform/webhooks/{id}",
	"/platform/webhooks/{id}/test",
	"/platform/audit",
	"/platform/import/work-objects",
	"/platform/export/work-objects",
];
for (const path of requiredPaths)
	if (!openapi.includes(`"${path}"`)) throw new Error(`OpenAPI path missing: ${path}`);

if (!openapi.includes('openapi: "3.1.0"'))
	throw new Error("OpenAPI 3.1 canonical document missing");
if (!openapi.includes("toOpenApiSchema("))
	throw new Error("OpenAPI schemas are not derived from canonical Zod contracts");

for (const legacy of ["apps/api/src/communication.ts", "apps/api/src/docs-files.ts"])
	if (existsSync(legacy)) throw new Error(`Legacy API implementation still exists: ${legacy}`);

const channelMember = schema.match(/model ChannelMember \{([\s\S]*?)\n\}/)?.[1] ?? "";
if (/organizationId\s+String\?/.test(channelMember))
	throw new Error("ChannelMember still contains redundant organizationId");
if (!channelMember.includes("organization Organization"))
	throw new Error("ChannelMember lacks canonical orgId organization relation");

console.log("Canonical contract integrity: OK");
