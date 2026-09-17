import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const registryPath = path.join(root, "packages/contracts/src/public-api.ts");
const apiRoot = path.join(root, "apps/api/src");
const registry = await readFile(registryPath, "utf8");

const pathMatches = [...registry.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
const methodMatches = [...registry.matchAll(/method:\s*"([A-Z]+)"/g)].map((match) => match[1]);
const operationMatches = [...registry.matchAll(/operationId:\s*"([^"]+)"/g)].map((match) => match[1]);

const pairKeys = pathMatches.map((routePath, index) => `${methodMatches[index]} ${routePath}`);
const duplicatePairs = pairKeys.filter((value, index) => pairKeys.indexOf(value) !== index);
if (duplicatePairs.length > 0)
	throw new Error(`Duplicate API contracts: ${[...new Set(duplicatePairs)].join(", ")}`);

const duplicateOperations = operationMatches.filter(
	(value, index) => operationMatches.indexOf(value) !== index,
);
if (duplicateOperations.length > 0)
	throw new Error(
		`Duplicate API operationIds: ${[...new Set(duplicateOperations)].join(", ")}`,
	);

async function walk(dir) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (entry.name === "node_modules" || entry.name === "generated") continue;
		const file = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(file)));
		else if (entry.name.endsWith(".ts")) files.push(file);
	}
	return files;
}

const sources = await Promise.all(
	(await walk(apiRoot)).map(async (file) => ({
		file,
		source: await readFile(file, "utf8"),
	})),
);

const sourceText = sources.map((entry) => entry.source).join("\n");
const missing = pathMatches.filter((routePath) => !sourceText.includes(`"${routePath}"`));
if (missing.length > 0)
	throw new Error(`Contract routes not wired into API source: ${missing.join(", ")}`);

console.log(
	`Canonical API contracts: OK (${pathMatches.length} operations, ${operationMatches.length} unique operationIds)`,
);
