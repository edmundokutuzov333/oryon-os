import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { can, evaluatePermissions, maskFields } from "@oryon/core";
import {
	AgentRepository,
	GraphRepository,
	PermissionRepository,
	ResourceRepository,
	WorkObjectRepository,
} from "@oryon/db/repositories";
import {
	claimOutboxEvents,
	completeOutboxEvent,
	dispatchOutboxBatch,
} from "@oryon/db/outbox";
import { getPrisma } from "@oryon/db";
import { executeAgentRun, rollbackAgentRun } from "./agent-runtime.js";

const enabled = process.env.ORYON_INTEGRATION === "1";
const ORG_A = "org_demo_0001";
const ORG_B = "org_demo_0002";
const WS_A = "ws_demo_0001";
const ADMIN = "usr_demo_admin";
const MEMBER = "usr_demo_member";
const OBJECT_A = "obj_demo_task_0001";

const db = getPrisma();
const graph = new GraphRepository(db);
const permissions = new PermissionRepository();
const resources = new ResourceRepository(db);
const work = new WorkObjectRepository(db);
const agents = new AgentRepository(db);

let createdObjectId = "";
let createdAgentId = "";
let createdEdgeIds: string[] = [];
let createdGrantId = "";

beforeAll(async () => {
	if (!enabled) return;
	await permissions.ensureWorkspaceMember(ORG_A, ADMIN, MEMBER, WS_A);
	createdObjectId = await work.create(ORG_A, ADMIN, {
		typeKey: "task",
		workspaceId: WS_A,
		title: "Etapa 2 integration object",
		priority: "NORMAL",
		classification: "internal",
		customFields: { secret: "value", public: "visible" },
	});
});

afterAll(async () => {
	if (!enabled) return;
	for (const edgeId of createdEdgeIds)
		await graph.deleteEdge(ORG_A, ADMIN, edgeId, "cleanup").catch(() => undefined);
	await db.$transaction(async (tx) => {
		if (createdGrantId)
			await tx.accessGrant.deleteMany({ where: { orgId: ORG_A, id: createdGrantId } });
		if (createdAgentId)
			await tx.agent.deleteMany({ where: { orgId: ORG_A, id: createdAgentId } });
		if (createdObjectId)
			await tx.workObject.deleteMany({ where: { orgId: ORG_A, id: createdObjectId } });
	});
});

describe("ETAPA 2 integration", () => {
	it.skipIf(!enabled)("proves tenant isolation and workspace permissions", async () => {
		const crossTenant = await resources.resolve(ORG_B, "work_object", OBJECT_A);
		expect(crossTenant).toBeNull();

		const resource = await resources.resolve(ORG_A, "work_object", OBJECT_A);
		expect(resource).not.toBeNull();

		const memberSnapshot = await permissions.getSnapshot(ORG_A, MEMBER, "work_object", OBJECT_A, "internal");
		expect(memberSnapshot.subject.workspaceIds).toContain(WS_A);
		expect(can({ orgId: ORG_A, ...memberSnapshot }, resource!, "read").allowed).toBe(true);
		expect(can({ orgId: ORG_A, ...memberSnapshot }, resource!, "update").allowed).toBe(false);

		const adminSnapshot = await permissions.getSnapshot(ORG_A, ADMIN, "work_object", OBJECT_A, "internal");
		expect(can({ orgId: ORG_A, ...adminSnapshot }, resource!, "update").allowed).toBe(true);

		createdGrantId = (await permissions.createGrant(ORG_A, ADMIN, {
			resourceType: "work_object",
			resourceId: OBJECT_A,
			principalId: MEMBER,
			level: "VIEW",
			fieldMask: ["secret"],
			reason: "ETAPA2_TEST",
		})).id;
		const maskedSnapshot = await permissions.getSnapshot(ORG_A, MEMBER, "work_object", OBJECT_A, "internal");
		const evaluation = evaluatePermissions(
			{ orgId: ORG_A, ...maskedSnapshot },
			{ resource: resource!, fields: ["secret", "public"] },
		);
		const masked = maskFields({ secret: "value", public: "visible" }, evaluation.exposure.fieldAccess);
		expect(masked.secret).toBe("••••••");
		expect(masked.public).toBe("visible");
	});

	it.skipIf(!enabled)("proves canonical graph inverse, cycles, soft delete uniqueness and polymorphic traversal", async () => {
		const secondId = await work.create(ORG_A, ADMIN, {
			typeKey: "task",
			workspaceId: WS_A,
			title: "Graph counterpart",
			priority: "NORMAL",
			classification: "internal",
		});
		try {
			const first = await graph.createEdge(ORG_A, ADMIN, {
				from: { type: "work_object", id: OBJECT_A },
				to: { type: "work_object", id: secondId },
				relation: "BLOCKS",
				metadata: { test: true },
			});
			createdEdgeIds.push(first.id);
			await expect(graph.createEdge(ORG_A, ADMIN, {
				from: { type: "work_object", id: secondId },
				to: { type: "work_object", id: OBJECT_A },
				relation: "BLOCKS",
				metadata: { inverse: true },
			})).rejects.toThrow("CYCLE_DETECTED");
			await graph.deleteEdge(ORG_A, ADMIN, first.id, "test");
			createdEdgeIds = createdEdgeIds.filter((id) => id !== first.id);
			const recreated = await graph.createEdge(ORG_A, ADMIN, {
				from: { type: "work_object", id: OBJECT_A },
				to: { type: "work_object", id: secondId },
				relation: "BLOCKED_BY",
				metadata: { restored: true },
			});
			createdEdgeIds.push(recreated.id);
			expect(recreated.id).toBeTypeOf("string");
			const generic = await graph.createEdge(ORG_A, ADMIN, {
				from: { type: "work_object", id: OBJECT_A },
				to: { type: "workspace", id: WS_A },
				relation: "ATTACHED_TO",
			});
			createdEdgeIds.push(generic.id);
			const traversal = await graph.traverse(ORG_A, {
				rootType: "work_object",
				rootId: OBJECT_A,
				depth: 2,
				direction: "out",
				relation: "*",
				includeTimeline: false,
			});
			expect(traversal.nodeRefs).toEqual(expect.arrayContaining([
				{ type: "work_object", id: secondId },
				{ type: "workspace", id: WS_A },
			]));
			await graph.deleteEdge(ORG_A, ADMIN, generic.id, "test");
			await graph.restoreEdge(ORG_A, ADMIN, generic.id, "test");
			await graph.deleteEdge(ORG_A, ADMIN, generic.id, "test");
		} finally {
			await db.$transaction(async (tx) =>
				tx.workObject.deleteMany({ where: { orgId: ORG_A, id: secondId } }),
			);
		}
	});

	it.skipIf(!enabled)("proves atomic outbox delivery and agent idempotency checkpoint execution and rollback", async () => {
		const pendingBefore = await claimOutboxEvents(ORG_A, 100);
		for (const event of pendingBefore) await completeOutboxEvent(ORG_A, event.id);

		const agent = await agents.create(ORG_A, ADMIN, {
			key: `etapa2-test-${Date.now()}`,
			name: "Etapa 2 Test Agent",
			principalUserId: ADMIN,
			systemPrompt: "Execute declared tools exactly.",
			knowledgeScope: { workspaces: [WS_A], types: ["task"], includeDocs: true, includeMessages: false },
			tools: [{ key: "graph.edge.create", description: "Create graph relation", sensitive: true, inputSchema: {} }],
			triggers: [],
			checkpointPolicy: "NEVER",
		});
		createdAgentId = agent.id;
		const key = `etapa2-${Date.now()}-agent`;
		const runInput = {
			input: {
				toolCalls: [{
					toolKey: "graph.edge.create",
					input: {
						from: { type: "work_object", id: OBJECT_A },
						to: { type: "work_object", id: createdObjectId },
						relation: "RELATES_TO",
					},
				}],
			},
			triggerType: "MANUAL" as const,
			idempotencyKey: key,
		};
		const run = await agents.createRun(ORG_A, ADMIN, agent.id, runInput);
		const duplicate = await agents.createRun(ORG_A, ADMIN, agent.id, { ...runInput, input: { toolCalls: [] } });
		expect(duplicate.id).toBe(run.id);
		const execution = await executeAgentRun(ORG_A, run.id);
		expect(execution.state).toBe("SUCCEEDED");
		const stored = await agents.findRun(ORG_A, run.id);
		expect(stored?.state).toBe("SUCCEEDED");
		const output = stored?.outputJson as { rollback?: Array<{ rollback: { operation: string; id?: string } }> } | null;
		expect(output?.rollback?.some((entry) => entry.rollback.operation === "graph.edge.delete")).toBe(true);
		const dispatchResult = await dispatchOutboxBatch(ORG_A, [
			{ key: "realtime", handle: async () => undefined },
			{ key: "search", handle: async () => undefined },
			{ key: "automation", handle: async () => undefined },
		]);
		expect(dispatchResult.claimed).toBeGreaterThan(0);
		await rollbackAgentRun(ORG_A, ADMIN, run.id);
		const rolledBack = await agents.findRun(ORG_A, run.id);
		expect(rolledBack?.state).toBe("ROLLED_BACK");
	});
});
