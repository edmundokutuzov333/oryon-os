import type { PrismaClient } from "../generated/client.js";
import { withOrgContext } from "../tenant.js";

type SearchDocument = {
	id: string;
	orgId: string;
	type: "work_object" | "page" | "file_asset";
	title: string;
	contentText: string;
	classification: string | null;
	updatedAt: number;
};

type SemanticRow = {
	id: string;
	type: SearchDocument["type"];
	distance: number;
};

function textFromCustomFields(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	)
		return String(value);
	if (Array.isArray(value)) return value.map(textFromCustomFields).join(" ");
	if (typeof value === "object")
		return Object.entries(value)
			.map(([key, child]) => `${key} ${textFromCustomFields(child)}`)
			.join(" ");
	return "";
}

export class SearchRepository {
	constructor(private readonly db: PrismaClient) {}

	async listIndexDocuments(orgId: string): Promise<SearchDocument[]> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const [objects, pages, files] = await Promise.all([
				tx.workObject.findMany({
					where: { orgId, deletedAt: null },
					select: {
						id: true,
						orgId: true,
						title: true,
						description: true,
						customFields: true,
						tags: true,
						classification: true,
						updatedAt: true,
					},
				}),
				tx.page.findMany({
					where: { orgId, deletedAt: null, indexable: true },
					select: {
						id: true,
						orgId: true,
						title: true,
						contentText: true,
						classification: true,
						updatedAt: true,
					},
				}),
				tx.fileAsset.findMany({
					where: { orgId, deletedAt: null },
					select: {
						id: true,
						orgId: true,
						name: true,
						ocrText: true,
						classification: true,
						createdAt: true,
					},
				}),
			]);
			return [
				...objects.map((row) => ({
					id: `work_object:${row.id}`,
					orgId: row.orgId,
					type: "work_object" as const,
					title: row.title,
					contentText: [
						row.description,
						row.tags.join(" "),
						textFromCustomFields(row.customFields),
					]
						.filter(Boolean)
						.join(" "),
					classification: row.classification,
					updatedAt: row.updatedAt.getTime(),
				})),
				...pages.map((row) => ({
					id: `page:${row.id}`,
					orgId: row.orgId,
					type: "page" as const,
					title: row.title,
					contentText: row.contentText ?? "",
					classification: row.classification,
					updatedAt: row.updatedAt.getTime(),
				})),
				...files.map((row) => ({
					id: `file_asset:${row.id}`,
					orgId: row.orgId,
					type: "file_asset" as const,
					title: row.name,
					contentText: row.ocrText ?? "",
					classification: row.classification,
					updatedAt: row.createdAt.getTime(),
				})),
			];
		});
	}

	async semantic(
		orgId: string,
		embedding: readonly number[],
		limit: number,
	): Promise<SemanticRow[]> {
		const vector = `[${embedding.join(",")}]`;
		return withOrgContext(this.db, orgId, async (tx) =>
			tx.$queryRawUnsafe<SemanticRow[]>(
				`
			SELECT id, 'work_object' AS type, (embedding <=> $1::vector) AS distance
			FROM work_objects WHERE org_id = $2 AND deleted_at IS NULL AND embedding IS NOT NULL
			UNION ALL
			SELECT id, 'page' AS type, (embedding <=> $1::vector) AS distance
			FROM pages WHERE org_id = $2 AND deleted_at IS NULL AND indexable = true AND embedding IS NOT NULL
			UNION ALL
			SELECT id, 'file_asset' AS type, (embedding <=> $1::vector) AS distance
			FROM file_assets WHERE org_id = $2 AND deleted_at IS NULL AND embedding IS NOT NULL
			ORDER BY distance ASC LIMIT $3`,
				vector,
				orgId,
				Math.min(Math.max(limit, 1), 50),
			),
		);
	}

	async setEmbedding(
		orgId: string,
		type: SearchDocument["type"],
		id: string,
		embedding: readonly number[],
	): Promise<void> {
		const vector = `[${embedding.join(",")}]`;
		await withOrgContext(this.db, orgId, async (tx) => {
			if (type === "work_object")
				await tx.$executeRawUnsafe(
					"UPDATE work_objects SET embedding = $1::vector WHERE org_id = $2 AND id = $3",
					vector,
					orgId,
					id,
				);
			else if (type === "page")
				await tx.$executeRawUnsafe(
					"UPDATE pages SET embedding = $1::vector WHERE org_id = $2 AND id = $3",
					vector,
					orgId,
					id,
				);
			else
				await tx.$executeRawUnsafe(
					"UPDATE file_assets SET embedding = $1::vector WHERE org_id = $2 AND id = $3",
					vector,
					orgId,
					id,
				);
		});
	}

	async lexicalFallback(
		orgId: string,
		query: string,
		limit: number,
		type?: SearchDocument["type"],
	): Promise<
		Array<{
			id: string;
			type: SearchDocument["type"];
			title: string;
			snippet: string;
		}>
	> {
		return withOrgContext(this.db, orgId, async (tx) => {
			const needle = query.trim();
			const rows: Array<{
				id: string;
				type: SearchDocument["type"];
				title: string;
				snippet: string;
			}> = [];
			if (!type || type === "work_object") {
				const objects = await tx.workObject.findMany({
					where: {
						orgId,
						deletedAt: null,
						OR: [
							{ title: { contains: needle, mode: "insensitive" } },
							{ description: { contains: needle, mode: "insensitive" } },
						],
					},
					select: { id: true, title: true, description: true },
					take: limit,
				});
				for (const row of objects)
					rows.push({
						id: row.id,
						type: "work_object",
						title: row.title,
						snippet: row.description?.slice(0, 240) ?? row.title,
					});
			}
			if (!type || type === "page") {
				const pages = await tx.page.findMany({
					where: {
						orgId,
						deletedAt: null,
						indexable: true,
						OR: [
							{ title: { contains: needle, mode: "insensitive" } },
							{ contentText: { contains: needle, mode: "insensitive" } },
						],
					},
					select: { id: true, title: true, contentText: true },
					take: limit,
				});
				for (const row of pages)
					rows.push({
						id: row.id,
						type: "page",
						title: row.title,
						snippet: row.contentText?.slice(0, 240) ?? row.title,
					});
			}
			if (!type || type === "file_asset") {
				const files = await tx.fileAsset.findMany({
					where: {
						orgId,
						deletedAt: null,
						OR: [
							{ name: { contains: needle, mode: "insensitive" } },
							{ ocrText: { contains: needle, mode: "insensitive" } },
						],
					},
					select: { id: true, name: true, ocrText: true },
					take: limit,
				});
				for (const row of files)
					rows.push({
						id: row.id,
						type: "file_asset",
						title: row.name,
						snippet: row.ocrText?.slice(0, 240) ?? row.name,
					});
			}
			return rows.slice(0, limit);
		});
	}

	async getSource(
		orgId: string,
		type: SearchDocument["type"],
		id: string,
	): Promise<{
		id: string;
		title: string;
		text: string;
		classification: string | null;
		workspaceId: string | null;
		ownerId: string | null;
	} | null> {
		return withOrgContext(this.db, orgId, async (tx) => {
			if (type === "work_object") {
				const row = await tx.workObject.findFirst({
					where: { orgId, id, deletedAt: null },
					select: {
						id: true,
						title: true,
						description: true,
						customFields: true,
						classification: true,
						workspaceId: true,
						ownerId: true,
					},
				});
				return row
					? {
							id: row.id,
							title: row.title,
							text: [row.description, textFromCustomFields(row.customFields)]
								.filter(Boolean)
								.join(" ")
								.slice(0, 6000),
							classification: row.classification,
							workspaceId: row.workspaceId,
							ownerId: row.ownerId,
						}
					: null;
			}
			if (type === "page") {
				const row = await tx.page.findFirst({
					where: { orgId, id, deletedAt: null, indexable: true },
					select: {
						id: true,
						title: true,
						contentText: true,
						classification: true,
						workspaceId: true,
						ownerId: true,
					},
				});
				return row
					? {
							id: row.id,
							title: row.title,
							text: (row.contentText ?? "").slice(0, 6000),
							classification: row.classification,
							workspaceId: row.workspaceId,
							ownerId: row.ownerId,
						}
					: null;
			}
			const row = await tx.fileAsset.findFirst({
				where: { orgId, id, deletedAt: null },
				select: {
					id: true,
					name: true,
					ocrText: true,
					classification: true,
					folderId: true,
					uploadedBy: true,
				},
			});
			return row
				? {
						id: row.id,
						title: row.name,
						text: (row.ocrText ?? "").slice(0, 6000),
						classification: row.classification,
						workspaceId: null,
						ownerId: row.uploadedBy,
					}
				: null;
		});
	}
}
