import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsRoot = path.join(root, "packages/db/prisma/migrations");
const migrationDir = path.join(migrationsRoot, "00000000000000_init");
const migrationFile = path.join(migrationDir, "migration.sql");
const rlsFile = path.join(root, "packages/db/prisma/rls.sql");

if (existsSync(migrationFile)) {
	console.log("Phase 2 initial migration already exists");
	process.exit(0);
}

mkdirSync(migrationDir, { recursive: true });
const schemaSql = execFileSync(
	"pnpm",
	[
		"--filter",
		"@oryon/db",
		"exec",
		"prisma",
		"migrate",
		"diff",
		"--from-empty",
		"--to-schema-datamodel",
		"prisma/schema.prisma",
		"--script",
	],
	{ cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

const rlsSql = readFileSync(rlsFile, "utf8");
writeFileSync(migrationFile, `${schemaSql.trim()}\n\n${rlsSql.trim()}\n`);
console.log(`Created ${path.relative(root, migrationFile)}`);
