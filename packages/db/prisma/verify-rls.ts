import { PrismaClient } from "../src/generated/client.js";

const prisma = new PrismaClient();

const ORG_A = "org_demo_0001";
const ORG_B = "org_demo_0002";
const USER_A = "usr_demo_admin";

function assert(condition: boolean, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
	await prisma.$transaction(async (tx) => {
		await tx.$executeRawUnsafe(
			"SELECT set_config('app.org_id', $1, true)",
			ORG_A,
		);
		const ownRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
			"SELECT id FROM organizations WHERE id = $1",
			ORG_A,
		);
		assert(
			ownRows.length === 1,
			"RLS failed: tenant can not read its own organization",
		);

		const crossRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
			"SELECT id FROM organizations WHERE id = $1",
			ORG_B,
		);
		assert(
			crossRows.length === 0,
			"RLS failed: tenant can read another organization",
		);

		const ownObjects = await tx.$queryRawUnsafe<Array<{ id: string }>>(
			"SELECT id FROM work_objects WHERE org_id = $1",
			ORG_A,
		);
		assert(
			ownObjects.some((row) => row.id === "obj_demo_task_0001"),
			"RLS failed: tenant can not read its own work object",
		);

		const crossObjects = await tx.$queryRawUnsafe<Array<{ id: string }>>(
			"SELECT id FROM work_objects WHERE org_id = $1",
			ORG_B,
		);
		assert(
			crossObjects.length === 0,
			"RLS failed: tenant can read another organization's work objects",
		);

		await tx.$executeRawUnsafe(
			"SELECT set_config('app.org_id', $1, true)",
			ORG_B,
		);
		const isolatedObjects = await tx.$queryRawUnsafe<Array<{ id: string }>>(
			"SELECT id FROM work_objects WHERE id = $1",
			"obj_demo_task_0001",
		);
		assert(
			isolatedObjects.length === 0,
			"RLS failed: switching tenant context exposed tenant A data",
		);
	});

	console.log(`RLS verification passed for ${ORG_A} and ${ORG_B}`);
	console.log(`verification actor: ${USER_A}`);
}

main()
	.then(async () => {
		await prisma.$disconnect();
	})
	.catch(async (error: unknown) => {
		console.error(error);
		await prisma.$disconnect();
		process.exit(1);
	});
