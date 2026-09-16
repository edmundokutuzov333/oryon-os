import type { PrismaClient } from "../generated/client.js";
import { withOrgContext } from "../tenant.js";

export class RoomRepository {
	constructor(private readonly db: PrismaClient) {}

	async listBookable(orgId: string) {
		return withOrgContext(this.db, orgId, (tx) => tx.room.findMany({ where: { orgId, bookable: true }, orderBy: { name: "asc" } }));
	}
}
