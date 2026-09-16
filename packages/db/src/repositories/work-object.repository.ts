import type { Prisma, PrismaClient } from "../generated/client.js";

export interface WorkObjectListInput {
	readonly orgId: string;
	readonly workspaceId?: string;
	readonly typeKey?: string;
	readonly limit?: number;
}

export class WorkObjectRepository {
	private readonly db: PrismaClient;

	constructor(db: PrismaClient) {
		this.db = db;
	}

	async list(input: WorkObjectListInput) {
		const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
		const where: Prisma.WorkObjectWhereInput = {
			orgId: input.orgId,
			deletedAt: null,
		};
		if (input.workspaceId !== undefined) where.workspaceId = input.workspaceId;
		if (input.typeKey !== undefined) where.typeKey = input.typeKey;

		return this.db.workObject.findMany({
			where,
			orderBy: { updatedAt: "desc" },
			take: limit,
		});
	}

	async findById(orgId: string, id: string) {
		return this.db.workObject.findFirst({
			where: { orgId, id, deletedAt: null },
		});
	}
}
