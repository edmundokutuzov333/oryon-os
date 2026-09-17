import { spawnSync } from "node:child_process";

const env = {
	...process.env,
	DATABASE_URL:
		process.env.DATABASE_URL ??
		"postgresql://oryon:oryon_local@127.0.0.1:5432/oryon?schema=public",
	DATABASE_DIRECT_URL:
		process.env.DATABASE_DIRECT_URL ??
		process.env.DATABASE_URL ??
		"postgresql://oryon:oryon_local@127.0.0.1:5432/oryon?schema=public",
};

const result = spawnSync(
	"pnpm",
	["--filter", "@oryon/db", "exec", "prisma", "validate", "--schema", "prisma/schema.prisma"],
	{
		env,
		stdio: "inherit",
		shell: process.platform === "win32",
	},
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
