import { readFileSync, writeFileSync } from "node:fs";

const path = "packages/db/prisma/schema.prisma";
const source = readFileSync(path, "utf8");
const normalized = source.replace(/^enum ([A-Za-z_][A-Za-z0-9_]*) \{ ([^{}\n]+) \}$/gm, (_match, name, values) => {
	const members = values.trim().split(/\s+/).map((value) => `\t${value}`).join("\n");
	return `enum ${name} {\n${members}\n}`;
});

if (normalized === source) {
	console.log("Prisma enum syntax already normalized");
	process.exit(0);
}

writeFileSync(path, normalized);
console.log(`Normalized Prisma enum syntax in ${path}`);
