import { readFile } from "node:fs/promises";

const schema = await readFile("packages/db/prisma/schema.prisma", "utf8");
const forbidden = [
	"model Task {",
	"model Deal {",
	"model Ticket {",
	"model Project {",
	"model Decision {",
	"model Incident {",
	"model Goal {",
	"model Company {",
	"model Contact {",
	"model Pipeline {",
];
const violations = forbidden.filter((name) => schema.includes(name));
if (violations.length > 0) {
	console.error(
		`V1 invariant failed: work-object satellite models found: ${violations.join(", ")}`,
	);
	process.exit(1);
}
if (
	!schema.includes("moneyAmount") ||
	!schema.includes("moneyCurrency") ||
	!schema.includes("probability") ||
	!schema.includes("secondaryDate") ||
	!schema.includes("externalRef") ||
	!schema.includes("severity")
) {
	console.error(
		"V1 invariant failed: promoted universal WorkObject fields are incomplete",
	);
	process.exit(1);
}
for (const primitive of [
	"model WorkObject {",
	"model ObjectTypeDef {",
	"model ObjectPlacement {",
	"model Assignment {",
	"model StatusTransition {",
]) {
	if (!schema.includes(primitive)) {
		console.error(
			`V1 invariant failed: work object primitive missing: ${primitive}`,
		);
		process.exit(1);
	}
}
if (
	!schema.includes("model Edge {") ||
	!schema.includes("enum EdgeRelation {") ||
	!schema.includes("@@unique([fromType, fromId, toType, toId, relation])")
) {
	console.error("V1 invariant failed: canonical work graph primitives missing");
	process.exit(1);
}
for (const relation of [
	"BLOCKS",
	"PARENT_OF",
	"DERIVED_FROM",
	"CONVERTED_TO",
	"RELATES_TO",
]) {
	if (!schema.includes(`  ${relation}`)) {
		console.error(
			`V1 invariant failed: required graph relation missing: ${relation}`,
		);
		process.exit(1);
	}
}
const phase4Required = [
	"model Role {",
	"model RoleBinding {",
	"model AccessGrant {",
	"model ClassificationLabel {",
	"enum ScopeType {",
	"enum AccessLevel {",
];
const phase4Missing = phase4Required.filter((name) => !schema.includes(name));
if (phase4Missing.length > 0) {
	console.error(
		`V1 invariant failed: phase 4 permission primitives missing: ${phase4Missing.join(", ")}`,
	);
	process.exit(1);
}
const permissionEngine = await readFile(
	"packages/core/src/permissions.ts",
	"utf8",
);
for (const required of [
	"export function can",
	"export function evaluatePermissions",
	"export function maskFields",
]) {
	if (!permissionEngine.includes(required)) {
		console.error(
			`V1 invariant failed: permission engine entrypoint missing: ${required}`,
		);
		process.exit(1);
	}
}
const workEngine = await readFile("packages/core/src/work-object.ts", "utf8");
for (const required of [
	"export function prepareWorkObjectCreate",
	"export function validateCustomFields",
	"export function transitionStatus",
	"export function generateHumanId",
]) {
	if (!workEngine.includes(required)) {
		console.error(
			`V1 invariant failed: work object engine entrypoint missing: ${required}`,
		);
		process.exit(1);
	}
}
const graphEngine = await readFile("packages/core/src/graph.ts", "utf8");
for (const required of [
	"export function graphNodeKey",
	"export function cycleWouldExist",
	"export function assertNoProtectedCycle",
	"export function validateGraphSelfEdge",
]) {
	if (!graphEngine.includes(required)) {
		console.error(
			`V1 invariant failed: work graph engine entrypoint missing: ${required}`,
		);
		process.exit(1);
	}
}
const graphContracts = await readFile(
	"packages/contracts/src/graph.schema.ts",
	"utf8",
);
for (const required of [
	"export const GraphEdgeCreateInputSchema",
	"export const GraphTraverseQuerySchema",
	"export const GraphTraverseResponseSchema",
]) {
	if (!graphContracts.includes(required)) {
		console.error(
			`V1 invariant failed: work graph contract missing: ${required}`,
		);
		process.exit(1);
	}
}
console.log("V1 schema invariants: OK");
