import { z } from "zod";

export const GraphRelationSchema = z.enum([
	"BLOCKS",
	"BLOCKED_BY",
	"DUPLICATES",
	"RELATES_TO",
	"DERIVED_FROM",
	"CONVERTED_TO",
	"PARENT_OF",
	"MENTIONS",
	"ATTACHED_TO",
	"OWNS",
	"DISCUSSED_IN",
	"DECIDED_IN",
	"RESULTED_IN",
	"FINISH_TO_START",
	"START_TO_START",
	"FINISH_TO_FINISH",
	"START_TO_FINISH",
]);

export const GraphDirectionSchema = z.enum(["out", "in", "both"]);
export const GraphNodeTypeSchema = z.string().min(1).max(80);

export const GraphNodeRefSchema = z.object({
	type: GraphNodeTypeSchema,
	id: z.string().min(1),
});

export const GraphEdgeCreateInputSchema = z.object({
	from: GraphNodeRefSchema,
	to: GraphNodeRefSchema,
	relation: GraphRelationSchema,
	lagDays: z.number().int().nullable().optional(),
	metadata: z.record(z.string(), z.unknown()).default({}),
});

export const GraphWorkObjectNodeSchema = z.object({
	type: z.literal("work_object"),
	id: z.string().min(1),
	humanId: z.string().min(1),
	title: z.string().min(1),
	status: z.string().min(1),
	statusCategory: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"]),
	priority: z.enum(["LOWEST", "LOW", "NORMAL", "HIGH", "URGENT"]),
	typeKey: z.string().min(1),
	ownerId: z.string().nullable(),
	workspaceId: z.string().nullable(),
	permissions: z.object({ read: z.boolean() }),
});

export const GraphNodeSchema = z.union([GraphWorkObjectNodeSchema, GraphNodeRefSchema]);

export const GraphEdgeSchema = z.object({
	id: z.string().min(1),
	orgId: z.string().min(1),
	from: GraphNodeRefSchema,
	to: GraphNodeRefSchema,
	relation: GraphRelationSchema,
	lagDays: z.number().int().nullable(),
	metadata: z.record(z.string(), z.unknown()),
	createdAt: z.string().datetime({ offset: true }),
});

export const GraphTimelineEventSchema = z.object({
	id: z.string().min(1),
	kind: z.enum(["DOMAIN_EVENT", "STATUS_TRANSITION"]),
	node: GraphNodeRefSchema,
	name: z.string().min(1),
	fromStatus: z.string().nullable(),
	toStatus: z.string().nullable(),
	comment: z.string().nullable(),
	actorId: z.string().nullable(),
	occurredAt: z.string().datetime({ offset: true }),
});

export const GraphTraverseQuerySchema = z.object({
	rootType: GraphNodeTypeSchema.default("work_object"),
	rootId: z.string().min(1),
	depth: z.coerce.number().int().min(0).max(10).default(2),
	direction: GraphDirectionSchema.default("both"),
	relation: z.union([GraphRelationSchema, z.literal("*")]).default("*"),
	includeTimeline: z.coerce.boolean().default(true),
});

export const GraphTraverseResponseSchema = z.object({
	root: GraphNodeRefSchema,
	nodes: z.array(GraphNodeSchema),
	edges: z.array(GraphEdgeSchema),
	timeline: z.array(GraphTimelineEventSchema),
	meta: z.object({
		depth: z.number().int().min(0).max(10),
		direction: GraphDirectionSchema,
		truncated: z.boolean(),
		visibleNodeCount: z.number().int().nonnegative(),
	}),
});

export const GraphEdgeResponseSchema = z.object({
	id: z.string().min(1),
});

export type GraphRelation = z.infer<typeof GraphRelationSchema>;
export type GraphDirection = z.infer<typeof GraphDirectionSchema>;
export type GraphNodeRef = z.infer<typeof GraphNodeRefSchema>;
export type GraphEdgeCreateInput = z.infer<typeof GraphEdgeCreateInputSchema>;
export type GraphTraverseQuery = z.infer<typeof GraphTraverseQuerySchema>;
export type GraphTraverseResponse = z.infer<typeof GraphTraverseResponseSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
export type GraphTimelineEvent = z.infer<typeof GraphTimelineEventSchema>;
