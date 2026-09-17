import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const rules = [
	{
		dir: "packages/ui",
		forbidden: ["@oryon/db", "@oryon/core", "@oryon/contracts"],
	},
	{ dir: "packages/core", forbidden: ["@oryon/db", "@oryon/ai"] },
	{
		dir: "packages/db",
		forbidden: ["prisma", "@prisma/client"],
		ignoredDirs: ["packages/db/src/generated"],
	},
	{ dir: "packages/ai", forbidden: [] },
];

async function walk(dir, ignoredDirs = []) {
	const entries = await readdir(dir, { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		if (
			entry.name === "node_modules" ||
			entry.name === ".next" ||
			entry.name === "dist"
		)
			continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			const relative = path.relative(root, full).split(path.sep).join("/");
			if (ignoredDirs.includes(relative)) continue;
			files.push(...(await walk(full, ignoredDirs)));
		} else if (/\.(ts|tsx|mts|cts|js|jsx)$/.test(entry.name)) {
			files.push(full);
		}
	}
	return files;
}

const violations = [];
for (const rule of rules) {
	const files = await walk(path.join(root, rule.dir), rule.ignoredDirs ?? []);
	for (const file of files) {
		const source = await readFile(file, "utf8");
		for (const forbidden of rule.forbidden) {
			if (
				new RegExp(
					`(?:from|import\\()\\s*[\\\"']${forbidden.replaceAll("/", "\\/")}\\b`,
				).test(source)
			) {
				violations.push(`${path.relative(root, file)} imports ${forbidden}`);
			}
		}
	}
}

if (violations.length) {
	console.error("Architecture boundary violations:");
	for (const violation of violations) console.error(`- ${violation}`);
	process.exit(1);
}

console.log("Architecture boundaries: OK");
