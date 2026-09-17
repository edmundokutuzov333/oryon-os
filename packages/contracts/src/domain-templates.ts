import {
	DomainTemplateManifestSchema,
	type DomainTemplateManifest,
} from "./domain-templates.schema.js";

const crm: DomainTemplateManifest = {
	key: "crm",
	version: 1,
	name: "CRM",
	shortDescription:
		"Clientes, contactos, oportunidades e actividade comercial.",
	description:
		"Um espaço comercial completo sobre o motor WorkObject, com pipeline, relacionamento e próximos passos ligados no mesmo grafo.",
	icon: "CRM",
	audience: "Equipas comerciais, account management e customer success.",
	objectTypes: [
		{
			key: "crm_account",
			name: "Conta",
			pluralName: "Contas",
			icon: "building",
			idPrefix: "ACC",
			schema: {
				fields: [
					{ key: "industry", label: "Sector", type: "TEXT", required: false },
					{ key: "website", label: "Website", type: "TEXT", required: false },
					{ key: "phone", label: "Telefone", type: "TEXT", required: false },
					{
						key: "employee_count",
						label: "Nº de colaboradores",
						type: "NUMBER",
						required: false,
					},
					{
						key: "customer_tier",
						label: "Tier",
						type: "SELECT",
						required: false,
						options: [
							{ key: "standard", label: "Standard" },
							{ key: "growth", label: "Growth" },
							{ key: "enterprise", label: "Enterprise" },
						],
					},
				],
			},
			statusModel: {
				initial: "active",
				states: [
					{ key: "prospect", label: "Prospect", category: "BACKLOG", order: 0 },
					{ key: "active", label: "Activa", category: "IN_PROGRESS", order: 1 },
					{ key: "at_risk", label: "Em risco", category: "BLOCKED", order: 2 },
					{
						key: "inactive",
						label: "Inactiva",
						category: "CANCELLED",
						order: 3,
					},
				],
				transitions: [
					{ from: "prospect", to: "active" },
					{ from: "active", to: "at_risk" },
					{ from: "at_risk", to: "active" },
					{ from: "active", to: "inactive" },
				],
			},
			defaultViews: [
				{ key: "accounts-list", type: "LIST", name: "Contas" },
				{ key: "accounts-board", type: "BOARD", name: "Estado" },
			],
		},
		{
			key: "crm_contact",
			name: "Contacto",
			pluralName: "Contactos",
			icon: "user",
			idPrefix: "CON",
			schema: {
				fields: [
					{ key: "email", label: "Email", type: "TEXT", required: false },
					{ key: "phone", label: "Telefone", type: "TEXT", required: false },
					{ key: "job_title", label: "Cargo", type: "TEXT", required: false },
					{ key: "source", label: "Origem", type: "TEXT", required: false },
				],
			},
			statusModel: {
				initial: "new",
				states: [
					{ key: "new", label: "Novo", category: "BACKLOG", order: 0 },
					{
						key: "engaged",
						label: "Em contacto",
						category: "IN_PROGRESS",
						order: 1,
					},
					{
						key: "qualified",
						label: "Qualificado",
						category: "IN_REVIEW",
						order: 2,
					},
					{
						key: "inactive",
						label: "Inactivo",
						category: "CANCELLED",
						order: 3,
					},
				],
				transitions: [
					{ from: "new", to: "engaged" },
					{ from: "engaged", to: "qualified" },
					{ from: "qualified", to: "inactive" },
				],
			},
			defaultViews: [{ key: "contacts-list", type: "LIST", name: "Contactos" }],
		},
		{
			key: "crm_opportunity",
			name: "Oportunidade",
			pluralName: "Oportunidades",
			icon: "target",
			idPrefix: "OPP",
			schema: {
				fields: [
					{
						key: "stage",
						label: "Etapa comercial",
						type: "SELECT",
						required: true,
						options: [
							{ key: "discovery", label: "Discovery" },
							{ key: "proposal", label: "Proposta" },
							{ key: "negotiation", label: "Negociação" },
							{ key: "closed_won", label: "Ganha" },
							{ key: "closed_lost", label: "Perdida" },
						],
					},
					{ key: "source", label: "Origem", type: "TEXT", required: false },
					{
						key: "next_step",
						label: "Próximo passo",
						type: "TEXT",
						required: false,
					},
				],
			},
			statusModel: {
				initial: "discovery",
				states: [
					{ key: "discovery", label: "Discovery", category: "TODO", order: 0 },
					{
						key: "proposal",
						label: "Proposta",
						category: "IN_PROGRESS",
						order: 1,
					},
					{
						key: "negotiation",
						label: "Negociação",
						category: "IN_REVIEW",
						order: 2,
					},
					{ key: "won", label: "Ganha", category: "DONE", order: 3 },
					{ key: "lost", label: "Perdida", category: "CANCELLED", order: 4 },
				],
				transitions: [
					{ from: "discovery", to: "proposal" },
					{ from: "proposal", to: "negotiation" },
					{ from: "negotiation", to: "won" },
					{ from: "negotiation", to: "lost" },
					{ from: "proposal", to: "lost" },
				],
			},
			defaultViews: [
				{ key: "pipeline", type: "KANBAN", name: "Pipeline" },
				{ key: "opportunities", type: "TABLE", name: "Oportunidades" },
			],
		},
		{
			key: "crm_activity",
			name: "Actividade",
			pluralName: "Actividades",
			icon: "check",
			idPrefix: "ACT",
			schema: {
				fields: [
					{
						key: "activity_type",
						label: "Tipo",
						type: "SELECT",
						required: true,
						options: [
							{ key: "call", label: "Chamada" },
							{ key: "meeting", label: "Reunião" },
							{ key: "email", label: "Email" },
							{ key: "note", label: "Nota" },
						],
					},
					{ key: "outcome", label: "Resultado", type: "TEXT", required: false },
				],
			},
			statusModel: {
				initial: "open",
				states: [
					{ key: "open", label: "Aberta", category: "TODO", order: 0 },
					{ key: "done", label: "Concluída", category: "DONE", order: 1 },
					{
						key: "cancelled",
						label: "Cancelada",
						category: "CANCELLED",
						order: 2,
					},
				],
				transitions: [
					{ from: "open", to: "done" },
					{ from: "open", to: "cancelled" },
				],
			},
			defaultViews: [
				{ key: "activities", type: "CALENDAR", name: "Actividades" },
			],
		},
	],
	relations: [
		{
			fromTypeKey: "crm_account",
			toTypeKey: "crm_contact",
			relation: "OWNS",
			label: "Tem contacto",
		},
		{
			fromTypeKey: "crm_contact",
			toTypeKey: "crm_opportunity",
			relation: "RELATES_TO",
			label: "Relaciona-se com oportunidade",
		},
		{
			fromTypeKey: "crm_account",
			toTypeKey: "crm_opportunity",
			relation: "RELATES_TO",
			label: "Tem oportunidade",
		},
		{
			fromTypeKey: "crm_opportunity",
			toTypeKey: "crm_activity",
			relation: "PARENT_OF",
			label: "Tem actividade",
		},
	],
	journeys: [
		{
			key: "lead_to_customer",
			name: "Lead até cliente",
			description: "Da descoberta ao fecho e seguimento comercial.",
			entryTypeKey: "crm_contact",
			outcomeTypeKey: "crm_account",
			steps: [
				{ key: "capture", label: "Capturar contacto", typeKey: "crm_contact" },
				{
					key: "qualify",
					label: "Qualificar oportunidade",
					typeKey: "crm_opportunity",
				},
				{
					key: "close",
					label: "Fechar oportunidade",
					typeKey: "crm_opportunity",
				},
				{
					key: "followup",
					label: "Planear seguimento",
					typeKey: "crm_activity",
				},
			],
		},
	],
};

const support: DomainTemplateManifest = {
	key: "support",
	version: 1,
	name: "Support",
	shortDescription: "Tickets, clientes, triagem, SLA e resolução.",
	description:
		"Operação de suporte construída com WorkObjects, permitindo ligar cliente, ticket, escalamento e resolução sem um motor paralelo.",
	icon: "SUP",
	audience: "Equipas de suporte, operações e customer care.",
	objectTypes: [
		{
			key: "support_customer",
			name: "Cliente",
			pluralName: "Clientes",
			icon: "user",
			idPrefix: "CUS",
			schema: {
				fields: [
					{ key: "email", label: "Email", type: "TEXT", required: false },
					{ key: "phone", label: "Telefone", type: "TEXT", required: false },
					{ key: "plan", label: "Plano", type: "TEXT", required: false },
				],
			},
			statusModel: {
				initial: "active",
				states: [
					{ key: "active", label: "Activo", category: "IN_PROGRESS", order: 0 },
					{
						key: "inactive",
						label: "Inactivo",
						category: "CANCELLED",
						order: 1,
					},
				],
				transitions: [
					{ from: "active", to: "inactive" },
					{ from: "inactive", to: "active" },
				],
			},
			defaultViews: [{ key: "customers", type: "LIST", name: "Clientes" }],
		},
		{
			key: "support_ticket",
			name: "Ticket",
			pluralName: "Tickets",
			icon: "inbox",
			idPrefix: "TKT",
			schema: {
				fields: [
					{
						key: "channel",
						label: "Canal",
						type: "SELECT",
						required: true,
						options: [
							{ key: "email", label: "Email" },
							{ key: "chat", label: "Chat" },
							{ key: "phone", label: "Telefone" },
							{ key: "web", label: "Web" },
						],
					},
					{
						key: "category",
						label: "Categoria",
						type: "TEXT",
						required: false,
					},
					{ key: "sla_due_at", label: "SLA", type: "DATE", required: false },
					{
						key: "resolution",
						label: "Resolução",
						type: "TEXT",
						required: false,
					},
				],
			},
			statusModel: {
				initial: "new",
				states: [
					{ key: "new", label: "Novo", category: "BACKLOG", order: 0 },
					{ key: "triage", label: "Triagem", category: "TODO", order: 1 },
					{
						key: "working",
						label: "Em atendimento",
						category: "IN_PROGRESS",
						order: 2,
					},
					{ key: "waiting", label: "À espera", category: "BLOCKED", order: 3 },
					{ key: "resolved", label: "Resolvido", category: "DONE", order: 4 },
					{ key: "closed", label: "Fechado", category: "CANCELLED", order: 5 },
				],
				transitions: [
					{ from: "new", to: "triage" },
					{ from: "triage", to: "working" },
					{ from: "working", to: "waiting" },
					{ from: "waiting", to: "working" },
					{ from: "working", to: "resolved" },
					{ from: "resolved", to: "closed" },
				],
			},
			defaultViews: [
				{ key: "support-board", type: "KANBAN", name: "Triagem" },
				{ key: "support-list", type: "TABLE", name: "Todos os tickets" },
			],
		},
		{
			key: "support_escalation",
			name: "Escalamento",
			pluralName: "Escalamentos",
			icon: "arrow-up",
			idPrefix: "ESC",
			schema: {
				fields: [
					{ key: "reason", label: "Motivo", type: "TEXT", required: true },
					{
						key: "target_team",
						label: "Equipa destino",
						type: "TEXT",
						required: false,
					},
					{
						key: "severity",
						label: "Severidade",
						type: "SELECT",
						required: true,
						options: [
							{ key: "low", label: "Baixa" },
							{ key: "medium", label: "Média" },
							{ key: "high", label: "Alta" },
							{ key: "critical", label: "Crítica" },
						],
					},
				],
			},
			statusModel: {
				initial: "open",
				states: [
					{ key: "open", label: "Aberto", category: "IN_PROGRESS", order: 0 },
					{ key: "accepted", label: "Aceite", category: "IN_REVIEW", order: 1 },
					{ key: "resolved", label: "Resolvido", category: "DONE", order: 2 },
				],
				transitions: [
					{ from: "open", to: "accepted" },
					{ from: "accepted", to: "resolved" },
				],
			},
			defaultViews: [
				{ key: "escalations", type: "LIST", name: "Escalamentos" },
			],
		},
	],
	relations: [
		{
			fromTypeKey: "support_customer",
			toTypeKey: "support_ticket",
			relation: "RELATES_TO",
			label: "Abriu ticket",
		},
		{
			fromTypeKey: "support_ticket",
			toTypeKey: "support_escalation",
			relation: "RESULTED_IN",
			label: "Escalou para",
		},
	],
	journeys: [
		{
			key: "ticket_to_resolution",
			name: "Ticket até resolução",
			description:
				"Triar, atender, escalar quando necessário e resolver com rastreabilidade.",
			entryTypeKey: "support_ticket",
			outcomeTypeKey: "support_ticket",
			steps: [
				{ key: "triage", label: "Triagem", typeKey: "support_ticket" },
				{ key: "resolve", label: "Resolver", typeKey: "support_ticket" },
				{
					key: "escalate",
					label: "Escalar quando necessário",
					typeKey: "support_escalation",
				},
			],
		},
	],
};

const productEngineering: DomainTemplateManifest = {
	key: "product_engineering",
	version: 1,
	name: "Product / Engineering",
	shortDescription: "Roadmap, épicos, histórias, bugs e entregas.",
	description:
		"Planeamento e execução de produto e engenharia com WorkObjects, estados, dependências e grafo partilhado.",
	icon: "ENG",
	audience: "Equipas de produto, design, engenharia e QA.",
	objectTypes: [
		{
			key: "eng_project",
			name: "Projecto",
			pluralName: "Projectos",
			icon: "folder",
			idPrefix: "PRJ",
			schema: {
				fields: [
					{ key: "goal", label: "Objectivo", type: "TEXT", required: false },
					{ key: "owner_team", label: "Equipa", type: "TEXT", required: false },
				],
			},
			statusModel: {
				initial: "planned",
				states: [
					{ key: "planned", label: "Planeado", category: "BACKLOG", order: 0 },
					{
						key: "active",
						label: "Em execução",
						category: "IN_PROGRESS",
						order: 1,
					},
					{ key: "done", label: "Concluído", category: "DONE", order: 2 },
					{
						key: "cancelled",
						label: "Cancelado",
						category: "CANCELLED",
						order: 3,
					},
				],
				transitions: [
					{ from: "planned", to: "active" },
					{ from: "active", to: "done" },
					{ from: "active", to: "cancelled" },
				],
			},
			defaultViews: [
				{ key: "projects", type: "PORTFOLIO", name: "Portefólio" },
			],
		},
		{
			key: "eng_epic",
			name: "Épico",
			pluralName: "Épicos",
			icon: "layers",
			idPrefix: "EPC",
			schema: {
				fields: [
					{ key: "outcome", label: "Outcome", type: "TEXT", required: false },
					{
						key: "target_release",
						label: "Release",
						type: "TEXT",
						required: false,
					},
				],
			},
			statusModel: {
				initial: "planned",
				states: [
					{ key: "planned", label: "Planeado", category: "BACKLOG", order: 0 },
					{
						key: "active",
						label: "Em execução",
						category: "IN_PROGRESS",
						order: 1,
					},
					{ key: "done", label: "Concluído", category: "DONE", order: 2 },
				],
				transitions: [
					{ from: "planned", to: "active" },
					{ from: "active", to: "done" },
				],
			},
			defaultViews: [{ key: "epics", type: "BOARD", name: "Épicos" }],
		},
		{
			key: "eng_story",
			name: "História",
			pluralName: "Histórias",
			icon: "list",
			idPrefix: "STY",
			schema: {
				fields: [
					{
						key: "acceptance_criteria",
						label: "Critérios de aceitação",
						type: "TEXT",
						required: false,
					},
					{
						key: "story_points",
						label: "Story points",
						type: "NUMBER",
						required: false,
					},
				],
			},
			statusModel: {
				initial: "backlog",
				states: [
					{ key: "backlog", label: "Backlog", category: "BACKLOG", order: 0 },
					{ key: "ready", label: "Ready", category: "TODO", order: 1 },
					{
						key: "doing",
						label: "Em desenvolvimento",
						category: "IN_PROGRESS",
						order: 2,
					},
					{
						key: "review",
						label: "Em revisão",
						category: "IN_REVIEW",
						order: 3,
					},
					{ key: "done", label: "Concluída", category: "DONE", order: 4 },
				],
				transitions: [
					{ from: "backlog", to: "ready" },
					{ from: "ready", to: "doing" },
					{ from: "doing", to: "review" },
					{ from: "review", to: "done" },
					{ from: "review", to: "doing" },
				],
			},
			defaultViews: [
				{ key: "stories", type: "KANBAN", name: "Sprint" },
				{ key: "stories-list", type: "TABLE", name: "Histórias" },
			],
		},
		{
			key: "eng_bug",
			name: "Bug",
			pluralName: "Bugs",
			icon: "bug",
			idPrefix: "BUG",
			schema: {
				fields: [
					{
						key: "severity",
						label: "Severidade",
						type: "SELECT",
						required: true,
						options: [
							{ key: "low", label: "Baixa" },
							{ key: "medium", label: "Média" },
							{ key: "high", label: "Alta" },
							{ key: "critical", label: "Crítica" },
						],
					},
					{
						key: "environment",
						label: "Ambiente",
						type: "TEXT",
						required: false,
					},
					{
						key: "steps_to_reproduce",
						label: "Passos para reproduzir",
						type: "TEXT",
						required: false,
					},
				],
			},
			statusModel: {
				initial: "open",
				states: [
					{ key: "open", label: "Aberto", category: "BACKLOG", order: 0 },
					{
						key: "doing",
						label: "Em correção",
						category: "IN_PROGRESS",
						order: 1,
					},
					{
						key: "review",
						label: "Em validação",
						category: "IN_REVIEW",
						order: 2,
					},
					{ key: "done", label: "Corrigido", category: "DONE", order: 3 },
				],
				transitions: [
					{ from: "open", to: "doing" },
					{ from: "doing", to: "review" },
					{ from: "review", to: "done" },
					{ from: "review", to: "doing" },
				],
			},
			defaultViews: [
				{ key: "bugs", type: "KANBAN", name: "Bugs" },
				{ key: "bugs-list", type: "LIST", name: "Lista" },
			],
		},
		{
			key: "eng_release",
			name: "Release",
			pluralName: "Releases",
			icon: "rocket",
			idPrefix: "REL",
			schema: {
				fields: [
					{ key: "version", label: "Versão", type: "TEXT", required: true },
					{ key: "release_date", label: "Data", type: "DATE", required: false },
				],
			},
			statusModel: {
				initial: "planned",
				states: [
					{ key: "planned", label: "Planeada", category: "BACKLOG", order: 0 },
					{ key: "ready", label: "Ready", category: "TODO", order: 1 },
					{ key: "shipped", label: "Entregue", category: "DONE", order: 2 },
				],
				transitions: [
					{ from: "planned", to: "ready" },
					{ from: "ready", to: "shipped" },
				],
			},
			defaultViews: [{ key: "releases", type: "TIMELINE", name: "Roadmap" }],
		},
	],
	relations: [
		{
			fromTypeKey: "eng_project",
			toTypeKey: "eng_epic",
			relation: "PARENT_OF",
			label: "Contém épico",
		},
		{
			fromTypeKey: "eng_epic",
			toTypeKey: "eng_story",
			relation: "PARENT_OF",
			label: "Contém história",
		},
		{
			fromTypeKey: "eng_story",
			toTypeKey: "eng_bug",
			relation: "RELATES_TO",
			label: "Relacionada com bug",
		},
		{
			fromTypeKey: "eng_story",
			toTypeKey: "eng_release",
			relation: "RESULTED_IN",
			label: "Entregue em release",
		},
		{
			fromTypeKey: "eng_bug",
			toTypeKey: "eng_release",
			relation: "RESULTED_IN",
			label: "Corrigido em release",
		},
	],
	journeys: [
		{
			key: "idea_to_release",
			name: "Ideia até release",
			description:
				"Transformar roadmap em trabalho executável e entregar através da mesma camada WorkObject.",
			entryTypeKey: "eng_epic",
			outcomeTypeKey: "eng_release",
			steps: [
				{ key: "plan", label: "Planear épico", typeKey: "eng_epic" },
				{ key: "build", label: "Executar histórias", typeKey: "eng_story" },
				{ key: "quality", label: "Corrigir e validar", typeKey: "eng_bug" },
				{ key: "ship", label: "Publicar release", typeKey: "eng_release" },
			],
		},
	],
};

export const DOMAIN_TEMPLATE_MANIFESTS = [crm, support, productEngineering].map(
	(template) => DomainTemplateManifestSchema.parse(template),
) as readonly DomainTemplateManifest[];

export function getDomainTemplate(
	key: string,
): DomainTemplateManifest | undefined {
	return DOMAIN_TEMPLATE_MANIFESTS.find((template) => template.key === key);
}
