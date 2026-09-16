import { readFile } from "node:fs/promises";

const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
const forbidden = ["model Task {", "model Deal {", "model Ticket {", "model Project {", "model Decision {", "model Incident {", "model Goal {", "model Company {", "model Contact {", "model Pipeline {"];
const violations = forbidden.filter((name) => schema.includes(name));
if (violations.length > 0) {
  console.error(`V1 invariant failed: work-object satellite models found: ${violations.join(", ")}`);
  process.exit(1);
}
if (!schema.includes("moneyAmount") || !schema.includes("moneyCurrency") || !schema.includes("probability") || !schema.includes("secondaryDate") || !schema.includes("externalRef") || !schema.includes("severity")) {
  console.error("V1 invariant failed: promoted universal WorkObject fields are incomplete");
  process.exit(1);
}
console.log("V1 schema invariants: OK");
