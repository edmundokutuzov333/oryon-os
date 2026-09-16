import { type Prisma, type PrismaClient } from "../src/generated/client.js";

export async function withOrgContext<T>(
	db: PrismaClient,
	orgId: string,
	operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
	return db.$transaction(async (tx) => {
		await tx.$executeRaw`SELECT set_config('app.org_id', ${orgId}, true)`;
		return operation(tx);
	});
}
