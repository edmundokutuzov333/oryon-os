import type { PrismaClient } from "../generated/client.js";
import { withOrgContext } from "../tenant.js";

export type AiPolicyRecord = {
	id: string;
	key: string;
	name: string;
	routingRules: unknown;
	allowedModels: string[];
	fallbackModel: string;
	maxClassification: string | null;
	residencyRegion: string | null;
	monthlyCapCents: bigint | null;
};

export class AiRepository {
	constructor(private readonly db: PrismaClient) {}

	async getContext(orgId: string): Promise<{ plan: string; policies: AiPolicyRecord[] }> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const [org, policies] = await Promise.all([
				tx.organization.findFirst({ where: { id: orgId }, select: { plan: true } }),
				tx.modelPolicy.findMany({ where: { orgId }, orderBy: { key: "asc" }, select: { id: true, key: true, name: true, routingRules: true, allowedModels: true, fallbackModel: true, maxClassification: true, residencyRegion: true, monthlyCapCents: true } }),
			]);
			if (!org) throw new Error("ORG_NOT_FOUND");
			return { plan: org.plan, policies: policies.map((policy) => ({ ...policy, residencyRegion: policy.residencyRegion })) };
		});
	}
}
