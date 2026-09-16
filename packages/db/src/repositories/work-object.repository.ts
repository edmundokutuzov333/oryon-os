import { PrismaClient } from "../generated/client.js";

export interface WorkObjectListInput {
	readonly orgId: string;
	readonly workspaceId?: string;
	readonly typeKey?: string;
	readonly limit?: number;
}

export class WorkObjectRepository {
	constructor(private readonly db: PrismaClient) {}

	async list(input: WorkObjectListInput) {
		const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
		return this.db.workObject.findMany({
			where: {
				orgId: input.orgId,
				workspaceId: input.workspaceId,
				typeKey: input.typeKey,
				deletedAt: null,
			},
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
