import { readFileSync, existsSync } from "node:fs";

const requiredFiles = [
  "packages/contracts/src/domain-templates.schema.ts",
  "packages/contracts/src/domain-templates.ts",
  "packages/contracts/src/domain-templates.test.ts",
  "packages/db/src/repositories/domain-template.repository.ts",
  "apps/api/src/domain-templates.ts",
  "apps/web/src/app/api/domain-templates/route.ts",
  "apps/web/src/app/api/domain-templates/[...segments]/route.ts",
  "apps/web/src/app/os/templates/page.tsx",
  "apps/web/src/app/os/templates/DomainTemplatesStudio.tsx",
  "apps/web/src/app/os/templates/templates.css",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Missing Phase 14 file: ${file}`);
}

const manifests = readFileSync("packages/contracts/src/domain-templates.ts", "utf8");
for (const key of ["crm", "support", "product_engineering"]) {
  if (!manifests.includes(`key: "${key}"`)) throw new Error(`Missing domain template: ${key}`);
}

const schema = readFileSync("packages/db/prisma/schema.prisma", "utf8");
if (schema.includes("model DomainTemplate")) throw new Error("Phase 14 must not introduce a parallel DomainTemplate persistence model");

const repo = readFileSync("packages/db/src/repositories/domain-template.repository.ts", "utf8");
for (const marker of ["withOrgContext", "appendDomainEvent", "objectTypeDef.create", "objectTypeDef.update"]) {
  if (!repo.includes(marker)) throw new Error(`Domain template repository missing required invariant: ${marker}`);
}

const api = readFileSync("apps/api/src/domain-templates.ts", "utf8");
for (const route of ["/v1/domain-templates", "/install", "/deactivate"]) {
  if (!api.includes(route)) throw new Error(`Missing API route marker: ${route}`);
}

const shell = readFileSync("apps/web/src/app/os/OryonAppShell.tsx", "utf8");
if (!shell.includes("/os/templates")) throw new Error("Templates navigation missing");

console.log("Phase 14 structural checks passed.");
