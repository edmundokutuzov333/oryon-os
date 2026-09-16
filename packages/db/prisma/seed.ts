import { PrismaClient } from "../src/generated/client.js";

const prisma = new PrismaClient();

const IDS = {
	org: "org_demo_0001",
	workspace: "ws_demo_0001",
	admin: "usr_demo_admin",
	member: "usr_demo_member",
	team: "team_demo_0001",
	role: "role_demo_admin",
	type: "type_demo_task",
	object: "obj_demo_task_0001",
	event: "evt_demo_seed_0001",
} as const;

const timestamp = new Date("2026-01-01T00:00:00.000Z");

async function main(): Promise<void> {
	await prisma.$transaction(async (tx) => {
		const org = await tx.organization.upsert({
			where: { id: IDS.org },
			update: {
				name: "Oryon Demo",
				defaultLocale: "pt-MZ",
				defaultTimezone: "Africa/Maputo",
			},
			create: {
				id: IDS.org,
				slug: "oryon-demo",
				name: "Oryon Demo",
				dataRegion: "AFRICA",
				reportingCurrency: "MZN",
				defaultLocale: "pt-MZ",
				defaultTimezone: "Africa/Maputo",
				plan: "TRIAL",
				settings: {},
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		});

		await tx.workspace.upsert({
			where: { id: IDS.workspace },
			update: { name: "Operações" },
			create: {
				id: IDS.workspace,
				orgId: org.id,
				key: "operations",
				name: "Operações",
				visibility: "ORG",
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		});

		for (const user of [
			{
				id: IDS.admin,
				email: "admin@oryon.local",
				name: "Oryon Admin",
				type: "MEMBER" as const,
			},
			{
				id: IDS.member,
				email: "member@oryon.local",
				name: "Oryon Member",
				type: "MEMBER" as const,
			},
		]) {
			await tx.user.upsert({
				where: { id: user.id },
				update: { name: user.name, status: "ACTIVE" },
				create: {
					...user,
					orgId: org.id,
					status: "ACTIVE",
					locale: "pt-MZ",
					timezone: "Africa/Maputo",
					createdAt: timestamp,
					updatedAt: timestamp,
				},
			});
		}

		await tx.team.upsert({
			where: { id: IDS.team },
			update: { name: "Operações" },
			create: {
				id: IDS.team,
				orgId: org.id,
				name: "Operações",
				slug: "operacoes",
				leadUserId: IDS.admin,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		});

		await tx.teamMember.upsert({
			where: { teamId_userId: { teamId: IDS.team, userId: IDS.admin } },
			update: { role: "LEAD" },
			create: {
				id: "tm_demo_admin",
				orgId: org.id,
				teamId: IDS.team,
				userId: IDS.admin,
				role: "LEAD",
				joinedAt: timestamp,
			},
		});

		await tx.teamMember.upsert({
			where: { teamId_userId: { teamId: IDS.team, userId: IDS.member } },
			update: { role: "MEMBER" },
			create: {
				id: "tm_demo_member",
				orgId: org.id,
				teamId: IDS.team,
				userId: IDS.member,
				role: "MEMBER",
				joinedAt: timestamp,
			},
		});

		await tx.role.upsert({
			where: { id: IDS.role },
			update: { permissions: ["*"] },
			create: {
				id: IDS.role,
				orgId: org.id,
				key: "workspace_admin",
				name: "Workspace Admin",
				isSystem: true,
				permissions: ["*"],
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		});

		await tx.roleBinding.upsert({
			where: {
				roleId_principalId_scopeType_scopeId: {
					roleId: IDS.role,
					principalId: IDS.admin,
					scopeType: "ORG",
					scopeId: org.id,
				},
			},
			update: { grantedBy: IDS.admin },
			create: {
				id: "rb_demo_admin",
				orgId: org.id,
				roleId: IDS.role,
				principalId: IDS.admin,
				scopeType: "ORG",
				scopeId: org.id,
				grantedBy: IDS.admin,
				createdAt: timestamp,
			},
		});

		await tx.classificationLabel.upsert({
			where: { orgId_key: { orgId: org.id, key: "internal" } },
			update: { name: "Internal", rank: 10 },
			create: {
				id: "label_demo_internal",
				orgId: org.id,
				key: "internal",
				name: "Internal",
				rank: 10,
				blocksExternal: false,
				blocksAi: false,
				blocksDownload: false,
				watermark: false,
			},
		});

		await tx.objectTypeDef.upsert({
			where: { id: IDS.type },
			update: { name: "Task", pluralName: "Tasks" },
			create: {
				id: IDS.type,
				orgId: org.id,
				key: "task",
				name: "Task",
				pluralName: "Tasks",
				isSystem: true,
				idPrefix: "TASK",
				schema: {
					fields: [
						{ key: "summary", type: "text", required: false },
						{ key: "effort", type: "number", required: false },
					],
				},
				statusModel: {
					statuses: ["open", "in_progress", "done", "cancelled"],
					transitions: [
						["open", "in_progress"],
						["in_progress", "done"],
						["open", "cancelled"],
						["in_progress", "cancelled"],
					],
				},
				defaultViews: ["LIST", "BOARD"],
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		});

		await tx.workObject.upsert({
			where: { id: IDS.object },
			update: { title: "Validar ambiente local", status: "open", updatedAt: timestamp },
			create: {
				id: IDS.object,
				orgId: org.id,
				workspaceId: IDS.workspace,
				typeKey: "task",
				typeDefId: IDS.type,
				humanId: "TASK-0001",
				title: "Validar ambiente local",
				status: "open",
				statusCategory: "TODO",
				priority: "HIGH",
				classification: "internal",
				tags: ["bootstrap", "phase-2"],
				customFields: { summary: "Validar PostgreSQL e RLS" },
				createdBy: IDS.admin,
				createdAt: timestamp,
				updatedAt: timestamp,
			},
		});

		await tx.domainEvent.upsert({
			where: { id: IDS.event },
			update: { payload: { source: "seed", version: 1 } },
			create: {
				id: IDS.event,
				orgId: org.id,
				name: "work_object.seeded",
				version: 1,
				actorId: IDS.admin,
				actorType: "MEMBER",
				subjectType: "WorkObject",
				subjectId: IDS.object,
				payload: { source: "seed", version: 1 },
				correlationId: "seed-phase-2",
				createdAt: timestamp,
			},
		});
	});
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
