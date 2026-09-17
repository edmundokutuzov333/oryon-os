import { spawnSync } from "node:child_process";

const databaseUrl =
	process.env.DATABASE_URL ??
	"postgresql://oryon:oryon_local@localhost:5432/oryon?schema=public";
const directDatabaseUrl = process.env.DATABASE_DIRECT_URL ?? databaseUrl;

const result = spawnSync(
	process.platform === "win32" ? "pnpm.cmd" : "pnpm",
	["exec", "prisma", "validate", "--schema", "prisma/schema.prisma"],
	{
		stdio: "inherit",
		env: {
			...process.env,
			DATABASE_URL: databaseUrl,
			DATABASE_DIRECT_URL: directDatabaseUrl,
		},
	},
);

if (result.error) throw result.error;
if ((result.status ?? 1) !== 0)
	process.exit(result.status ?? 1);
