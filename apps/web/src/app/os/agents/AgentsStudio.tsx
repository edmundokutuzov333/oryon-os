"use client";

import { useCallback, useEffect, useState } from "react";
import {
	AgentRunResponseSchema,
	AgentSummarySchema,
	type AgentRunResponse,
	type AgentSummary,
} from "@oryon/contracts/agents-automation";
import {
	Button,
	Card,
	EmptyState,
	ErrorState,
	InvertedPanel,
	Input,
	PageHeader,
	StatusChip,
	Textarea,
} from "@oryon/ui";
import "./agents.css";

function data(payload: unknown): unknown {
	if (!payload || typeof payload !== "object" || !("data" in payload))
		throw new Error("INVALID_RESPONSE");
	return (payload as { data: unknown }).data;
}
function statusState(
	state: AgentRunResponse["state"],
): "neutral" | "info" | "positive" | "danger" {
	if (state === "SUCCEEDED") return "positive";
	if (state === "FAILED" || state === "CANCELLED" || state === "ROLLED_BACK")
		return "danger";
	if (state === "WAITING") return "info";
	return "neutral";
}

export function AgentsStudio(): React.ReactElement {
	const [agents, setAgents] = useState<AgentSummary[]>([]);
	const [runs, setRuns] = useState<Record<string, AgentRunResponse>>({});
	const [selected, setSelected] = useState<AgentSummary | null>(null);
	const [name, setName] = useState("");
	const [key, setKey] = useState("");
	const [prompt, setPrompt] = useState(
		"Executa o trabalho pedido usando apenas as ferramentas declaradas.",
	);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(false);
	const [creating, setCreating] = useState(false);
	const [running, setRunning] = useState(false);
	const load = useCallback(async () => {
		setLoading(true);
		setError(false);
		try {
			const response = await fetch("/api/agents", { cache: "no-store" });
			if (!response.ok) throw new Error("LOAD_FAILED");
			setAgents(AgentSummarySchema.array().parse(data(await response.json())));
		} catch {
			setError(true);
		} finally {
			setLoading(false);
		}
	}, []);
	useEffect(() => {
		void load();
	}, [load]);
	async function createAgent(): Promise<void> {
		if (!name.trim() || !key.trim() || creating) return;
		setCreating(true);
		try {
			const response = await fetch("/api/agents", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": crypto.randomUUID(),
				},
				body: JSON.stringify({
					key,
					name,
					systemPrompt: prompt,
					tools: [
						{
							key: "work_object.get",
							description: "Ler um WorkObject",
							sensitive: false,
							inputSchema: {},
						},
						{
							key: "work_object.list",
							description: "Listar WorkObjects",
							sensitive: false,
							inputSchema: {},
						},
						{
							key: "work_object.create",
							description: "Criar um WorkObject",
							sensitive: true,
							inputSchema: {},
						},
						{
							key: "work_object.update",
							description: "Actualizar um WorkObject",
							sensitive: true,
							inputSchema: {},
						},
						{
							key: "work_object.status",
							description: "Alterar estado de um WorkObject",
							sensitive: true,
							inputSchema: {},
						},
					],
					knowledgeScope: {
						workspaces: [],
						types: [],
						includeDocs: true,
						includeMessages: false,
					},
					checkpointPolicy: "SENSITIVE_ONLY",
					triggers: [],
				}),
			});
			if (!response.ok) throw new Error("CREATE_FAILED");
			setName("");
			setKey("");
			await load();
		} finally {
			setCreating(false);
		}
	}
	async function runAgent(agent: AgentSummary): Promise<void> {
		if (running) return;
		setRunning(true);
		try {
			const response = await fetch(`/api/agents/${agent.id}/runs`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Idempotency-Key": crypto.randomUUID(),
				},
				body: JSON.stringify({
					input: {
						instruction: `Executar uma tarefa para ${agent.name}`,
						toolCalls: [{ toolKey: "work_object.list", input: {} }],
					},
					triggerType: "MANUAL",
				}),
			});
			if (!response.ok) throw new Error("RUN_FAILED");
			const created = AgentRunResponseSchema.parse(data(await response.json()));
			setRuns((current) => ({ ...current, [agent.id]: created }));
			setSelected(agent);
			await pollRun(created.id, agent.id);
		} finally {
			setRunning(false);
		}
	}
	async function pollRun(runId: string, agentId: string): Promise<void> {
		for (let attempt = 0; attempt < 20; attempt += 1) {
			const response = await fetch(`/api/agent-runs/${runId}`, {
				cache: "no-store",
			});
			if (!response.ok) return;
			const run = AgentRunResponseSchema.parse(data(await response.json()));
			setRuns((current) => ({ ...current, [agentId]: run }));
			if (!["RUNNING", "WAITING"].includes(run.state)) return;
			await new Promise((resolve) => setTimeout(resolve, 1200));
		}
	}
	async function checkpoint(
		run: AgentRunResponse,
		decision: "APPROVE" | "REJECT",
	): Promise<void> {
		const response = await fetch(`/api/agent-runs/${run.id}/checkpoint`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Idempotency-Key": crypto.randomUUID(),
			},
			body: JSON.stringify({ decision }),
		});
		if (!response.ok) return;
		const next = AgentRunResponseSchema.parse(data(await response.json()));
		const owner = agents.find((agent) => agent.id === next.agentId);
		setRuns((current) => ({ ...current, [next.agentId]: next }));
		if (owner) await pollRun(next.id, owner.id);
	}
	async function rollback(run: AgentRunResponse): Promise<void> {
		const response = await fetch(`/api/agent-runs/${run.id}/rollback`, {
			method: "POST",
			headers: { "Idempotency-Key": crypto.randomUUID() },
		});
		if (!response.ok) return;
		const next = AgentRunResponseSchema.parse(data(await response.json()));
		setRuns((current) => ({ ...current, [next.agentId]: next }));
	}
	return (
		<section className="agents-shell">
			<PageHeader
				title="Agents"
				description="Agentes com identidade própria, ferramentas, checkpoints, orçamento, execução e rollback."
			/>
			<div className="agents-grid">
				<Card>
					<div className="agents-card-content">
						<strong>Novo agente</strong>
						<Input
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Nome do agente"
						/>
						<Input
							value={key}
							onChange={(event) => setKey(event.target.value)}
							placeholder="agent-key"
						/>
						<Textarea
							value={prompt}
							onChange={(event) => setPrompt(event.target.value)}
							placeholder="Instruções do agente"
						/>
						<Button
							variant="primary"
							onClick={() => {
								void createAgent();
							}}
							loading={creating}
						>
							Criar agente
						</Button>
					</div>
				</Card>
				<InvertedPanel>
					<div className="agents-runtime">
						<span>Runtime</span>
						<strong>Execution control</strong>
						<p>
							Operações sensíveis ficam paradas até uma decisão humana
							explícita.
						</p>
					</div>
				</InvertedPanel>
			</div>
			{error ? (
				<ErrorState
					title="Não foi possível carregar os agentes"
					detail="Verifique a API e tente novamente."
				/>
			) : null}
			{!loading && agents.length === 0 ? (
				<EmptyState
					title="Nenhum agente"
					detail="Crie o primeiro agente para começar a fechar trabalho real."
				/>
			) : null}
			<div className="agents-list">
				{agents.map((agent) => {
					const run = runs[agent.id];
					return (
						<Card key={agent.id} interactive>
							<div className="agents-card-content">
								<div className="agents-row">
									<div>
										<strong>{agent.name}</strong>
										<div className="agents-meta">{agent.key}</div>
									</div>
									<StatusChip
										state={agent.status === "ACTIVE" ? "positive" : "neutral"}
									>
										{agent.status}
									</StatusChip>
								</div>
								<div className="agents-actions">
									<Button
										variant="secondary"
										onClick={() => {
											void runAgent(agent);
										}}
										loading={running && selected?.id === agent.id}
									>
										Executar
									</Button>
									{run ? (
										<StatusChip state={statusState(run.state)}>
											{run.state}
										</StatusChip>
									) : null}
									{run?.state === "WAITING" ? (
										<>
											<Button
												variant="primary"
												onClick={() => {
													void checkpoint(run, "APPROVE");
												}}
											>
												Aprovar
											</Button>
											<Button
												variant="secondary"
												onClick={() => {
													void checkpoint(run, "REJECT");
												}}
											>
												Rejeitar
											</Button>
										</>
									) : null}
									{run && ["SUCCEEDED", "FAILED"].includes(run.state) ? (
										<Button
											variant="secondary"
											onClick={() => {
												void rollback(run);
											}}
										>
											Rollback
										</Button>
									) : null}
								</div>
								{run ? (
									<div className="agents-meta">
										{run.toolCalls.length} tool calls · {run.costCents ?? "0"}{" "}
										cents · {run.writtenResources.length} writes
									</div>
								) : null}
							</div>
						</Card>
					);
				})}
			</div>
		</section>
	);
}
