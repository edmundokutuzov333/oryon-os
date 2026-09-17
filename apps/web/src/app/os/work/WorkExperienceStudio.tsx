"use client";

import { useEffect, useMemo, useState } from "react";
import {
	Button,
	Card,
	DataRow,
	EmptyState,
	ErrorState,
	EntityCard,
	InvertedPanel,
	MetricCard,
	SearchField,
	SegmentedTabs,
	SelectPill,
	StatusChip,
	Textarea,
	Input,
} from "@oryon/ui";
import {
	WorkObjectResponseSchema,
	ObjectTypeDefSchema,
	type ObjectTypeDefContract,
	type WorkObjectResponse,
} from "@oryon/contracts/work-object";
import {
	WorkObjectAttachmentSchema,
	WorkObjectCommentSchema,
	WorkObjectHistoryResponseSchema,
	type WorkObjectAttachment,
	type WorkObjectComment,
	type WorkObjectHistoryEvent,
} from "@oryon/contracts/work-experience";
import {
	IdentityContextSchema,
	type IdentityContext,
} from "@oryon/contracts/identity";
import { WorkBoardDnd } from "./WorkBoardDnd";

export const statusLabel: Record<string, string> = {
	BACKLOG: "Backlog",
	TODO: "A fazer",
	IN_PROGRESS: "Em progresso",
	BLOCKED: "Bloqueado",
	IN_REVIEW: "Em revisão",
	DONE: "Concluído",
	CANCELLED: "Cancelado",
};
const priorityLabel: Record<string, string> = {
	LOWEST: "Muito baixa",
	LOW: "Baixa",
	NORMAL: "Normal",
	HIGH: "Alta",
	URGENT: "Urgente",
};
const views = [
	{ value: "list", label: "Lista" },
	{ value: "board", label: "Board" },
	{ value: "calendar", label: "Calendário" },
	{ value: "timeline", label: "Timeline" },
];
type ViewMode = (typeof views)[number]["value"];

function tone(
	category: WorkObjectResponse["statusCategory"],
): "positive" | "warning" | "danger" | "neutral" | "info" {
	if (category === "DONE") return "positive";
	if (category === "BLOCKED" || category === "CANCELLED") return "danger";
	if (category === "IN_PROGRESS" || category === "IN_REVIEW") return "info";
	if (category === "BACKLOG") return "neutral";
	return "warning";
}
function date(value: string | null): string {
	return value
		? new Intl.DateTimeFormat("pt-PT", {
				day: "2-digit",
				month: "short",
				year: "numeric",
			}).format(new Date(value))
		: "Sem data";
}
function dateTime(value: string): string {
	return new Intl.DateTimeFormat("pt-PT", {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(value));
}
async function requestApi(path: string, init?: RequestInit): Promise<unknown> {
	const response = await fetch(path, { ...init, cache: "no-store" });
	const payload = (await response.json()) as {
		data?: unknown;
		error?: { message?: string };
	};
	if (!response.ok || payload.data === undefined)
		throw new Error(payload.error?.message ?? "Operação falhou");
	return payload.data;
}

export function WorkExperienceStudio() {
	const [objects, setObjects] = useState<WorkObjectResponse[]>([]);
	const [types, setTypes] = useState<ObjectTypeDefContract[]>([]);
	const [identity, setIdentity] = useState<IdentityContext>();
	const [selectedId, setSelectedId] = useState<string>();
	const [view, setView] = useState<ViewMode>("list");
	const [query, setQuery] = useState("");
	const [typeFilter, setTypeFilter] = useState("");
	const [statusFilter, setStatusFilter] = useState("");
	const [selectedStatus, setSelectedStatus] = useState("");
	const [selectedType, setSelectedType] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [dueAt, setDueAt] = useState("");
	const [creating, setCreating] = useState(false);
	const [comments, setComments] = useState<WorkObjectComment[]>([]);
	const [history, setHistory] = useState<WorkObjectHistoryEvent[]>([]);
	const [attachments, setAttachments] = useState<WorkObjectAttachment[]>([]);
	const [commentText, setCommentText] = useState("");
	const [fileId, setFileId] = useState("");
	const [busy, setBusy] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();
	const [notice, setNotice] = useState<string>();
	const selected = useMemo(
		() => objects.find((item) => item.id === selectedId),
		[objects, selectedId],
	);
	const selectedTypeDef = useMemo(
		() =>
			types.find((type) => type.key === (selected?.typeKey ?? selectedType)),
		[selected, selectedType, types],
	);
	const filtered = useMemo(
		() =>
			objects.filter((item) => {
				const hay =
					`${item.title} ${item.description ?? ""} ${item.humanId} ${item.typeKey}`.toLocaleLowerCase();
				return (
					(!query || hay.includes(query.toLocaleLowerCase())) &&
					(!typeFilter || item.typeKey === typeFilter) &&
					(!statusFilter || item.statusCategory === statusFilter)
				);
			}),
		[objects, query, statusFilter, typeFilter],
	);
	const columns = useMemo(
		() =>
			[
				"BACKLOG",
				"TODO",
				"IN_PROGRESS",
				"BLOCKED",
				"IN_REVIEW",
				"DONE",
				"CANCELLED",
			]
				.map((key) => ({
					key,
					label: statusLabel[key] ?? key,
					items: filtered.filter((item) => item.statusCategory === key),
				}))
				.filter((column) => column.items.length > 0),
		[filtered],
	);
	const dated = useMemo(
		() =>
			[...filtered].sort((a, b) =>
				(a.dueAt ?? a.startAt ?? "").localeCompare(b.dueAt ?? b.startAt ?? ""),
			),
		[filtered],
	);

	async function reload() {
		setBusy(true);
		setError(undefined);
		try {
			const [identityData, typeData, objectData] = await Promise.all([
				requestApi("/api/auth/session"),
				requestApi("/api/object-types"),
				requestApi("/api/work-objects?limit=200"),
			]);
			const nextIdentity = IdentityContextSchema.parse(identityData);
			const nextTypes = ObjectTypeDefSchema.array().parse(typeData);
			const nextObjects = WorkObjectResponseSchema.array().parse(objectData);
			setIdentity(nextIdentity);
			setTypes(nextTypes);
			setObjects(nextObjects);
			setSelectedId((current) =>
				current && nextObjects.some((item) => item.id === current)
					? current
					: nextObjects[0]?.id,
			);
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Não foi possível carregar o trabalho",
			);
		} finally {
			setBusy(false);
		}
	}
	async function loadDetail(id: string) {
		setSelectedId(id);
		try {
			const [objectData, commentData, historyData, attachmentData] =
				await Promise.all([
					requestApi(`/api/work-objects/${encodeURIComponent(id)}`),
					requestApi(`/api/work-objects/${encodeURIComponent(id)}/comments`),
					requestApi(`/api/work-objects/${encodeURIComponent(id)}/history`),
					requestApi(`/api/work-objects/${encodeURIComponent(id)}/attachments`),
				]);
			const object = WorkObjectResponseSchema.parse(objectData);
			setObjects((current) =>
				current.map((item) => (item.id === object.id ? object : item)),
			);
			setSelectedStatus(object.status);
			setSelectedType(object.typeKey);
			setTitle(object.title);
			setDescription(object.description ?? "");
			setDueAt(object.dueAt ? object.dueAt.slice(0, 16) : "");
			setComments(WorkObjectCommentSchema.array().parse(commentData));
			setHistory(WorkObjectHistoryResponseSchema.parse(historyData));
			setAttachments(WorkObjectAttachmentSchema.array().parse(attachmentData));
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Não foi possível abrir o objecto",
			);
		}
	}
	useEffect(() => {
		void reload();
	}, []);
	useEffect(() => {
		if (selectedId) void loadDetail(selectedId);
	}, [selectedId]);

	async function saveObject() {
		if (!selectedType || !title.trim()) return;
		setSaving(true);
		setError(undefined);
		try {
			const body = {
				title: title.trim(),
				description: description || null,
				dueAt: dueAt ? new Date(dueAt).toISOString() : null,
			};
			const data = creating
				? await requestApi("/api/work-objects", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							typeKey: selectedType,
							workspaceId: identity?.workspaces[0]?.id ?? null,
							...body,
						}),
					})
				: selected
					? await requestApi(
							`/api/work-objects/${encodeURIComponent(selected.id)}`,
							{
								method: "PATCH",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify(body),
							},
						)
					: null;
			if (!data) throw new Error("Seleccione um objecto");
			const object = WorkObjectResponseSchema.parse(data);
			setObjects((current) =>
				creating
					? [object, ...current]
					: current.map((item) => (item.id === object.id ? object : item)),
			);
			setCreating(false);
			setSelectedId(object.id);
			setNotice(creating ? "Objecto criado" : "Objecto actualizado");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Não foi possível guardar o objecto",
			);
		} finally {
			setSaving(false);
		}
	}
	async function updateStatus(status: string) {
		if (!selected?.permissions.update || status === selected.status) return;
		setSaving(true);
		try {
			const data = await requestApi(
				`/api/work-objects/${encodeURIComponent(selected.id)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status }),
				},
			);
			const object = WorkObjectResponseSchema.parse(data);
			setObjects((current) =>
				current.map((item) => (item.id === object.id ? object : item)),
			);
			setSelectedStatus(object.status);
			setHistory(
				WorkObjectHistoryResponseSchema.parse(
					await requestApi(
						`/api/work-objects/${encodeURIComponent(object.id)}/history`,
					),
				),
			);
			setNotice("Estado actualizado");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Não foi possível alterar o estado",
			);
		} finally {
			setSaving(false);
		}
	}
	async function moveObject(objectId: string, category: string) {
		const object = objects.find((item) => item.id === objectId);
		if (!object?.permissions.update) return;
		const type = types.find((item) => item.key === object.typeKey);
		const target = type?.statusModel.states.find(
			(state) => state.category === category,
		);
		if (target) await updateStatusForObject(objectId, target.key);
	}
	async function updateStatusForObject(objectId: string, status: string) {
		setSaving(true);
		try {
			const data = await requestApi(
				`/api/work-objects/${encodeURIComponent(objectId)}`,
				{
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ status }),
				},
			);
			const object = WorkObjectResponseSchema.parse(data);
			setObjects((current) =>
				current.map((item) => (item.id === object.id ? object : item)),
			);
			setNotice("Estado actualizado");
			if (selectedId === object.id) {
				setSelectedStatus(object.status);
				setHistory(
					WorkObjectHistoryResponseSchema.parse(
						await requestApi(
							`/api/work-objects/${encodeURIComponent(object.id)}/history`,
						),
					),
				);
			}
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Não foi possível mover o trabalho",
			);
		} finally {
			setSaving(false);
		}
	}
	async function addComment() {
		if (!selected || !commentText.trim() || !selected.permissions.comment)
			return;
		setSaving(true);
		try {
			const data = await requestApi(
				`/api/work-objects/${encodeURIComponent(selected.id)}/comments`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						bodyText: commentText.trim(),
						mentions: [],
						isInternal: false,
					}),
				},
			);
			setComments((current) => [
				...current,
				WorkObjectCommentSchema.parse(data),
			]);
			setCommentText("");
			setNotice("Comentário adicionado");
		} catch (e) {
			setError(
				e instanceof Error
					? e.message
					: "Não foi possível adicionar o comentário",
			);
		} finally {
			setSaving(false);
		}
	}
	async function assignSelf() {
		if (
			!selected ||
			!selected.permissions.update ||
			!identity?.user.id ||
			selected.assignments.some(
				(item) => item.userId === identity.user.id && item.role === "ASSIGNEE",
			)
		)
			return;
		setSaving(true);
		try {
			await requestApi(
				`/api/work-objects/${encodeURIComponent(selected.id)}/assignments`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						userId: identity.user.id,
						role: "ASSIGNEE",
						allocation: 100,
					}),
				},
			);
			const object = WorkObjectResponseSchema.parse(
				await requestApi(
					`/api/work-objects/${encodeURIComponent(selected.id)}`,
				),
			);
			setObjects((current) =>
				current.map((item) => (item.id === object.id ? object : item)),
			);
			setNotice("Você foi atribuído");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Não foi possível atribuir o trabalho",
			);
		} finally {
			setSaving(false);
		}
	}
	async function attachFile() {
		if (!selected || !fileId.trim() || !selected.permissions.update) return;
		setSaving(true);
		try {
			await requestApi(
				`/api/work-objects/${encodeURIComponent(selected.id)}/attachments`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ fileId: fileId.trim() }),
				},
			);
			setAttachments(
				WorkObjectAttachmentSchema.array().parse(
					await requestApi(
						`/api/work-objects/${encodeURIComponent(selected.id)}/attachments`,
					),
				),
			);
			setFileId("");
			setNotice("Anexo associado");
		} catch (e) {
			setError(
				e instanceof Error ? e.message : "Não foi possível associar o anexo",
			);
		} finally {
			setSaving(false);
		}
	}
	function startNew() {
		setCreating(true);
		setSelectedId(undefined);
		setSelectedType(types[0]?.key ?? "");
		setSelectedStatus("");
		setTitle("");
		setDescription("");
		setDueAt("");
		setComments([]);
		setHistory([]);
		setAttachments([]);
		setNotice(undefined);
	}

	if (busy)
		return (
			<section className="oe-shell">
				<Card>
					<div className="oe-loading" aria-label="A carregar trabalho" />
				</Card>
			</section>
		);
	if (error && objects.length === 0)
		return (
			<section className="oe-shell">
				<ErrorState
					title="O trabalho não carregou"
					detail={error}
					action={
						<Button onClick={() => void reload()}>Tentar novamente</Button>
					}
				/>
			</section>
		);
	return (
		<section className="oe-shell" aria-label="Experiência de trabalho">
			<header className="oe-header">
				<div>
					<p className="oe-kicker">Work Experience</p>
					<h1>Trabalho</h1>
					<p>
						Uma única vista para descobrir, mover, atribuir e concluir trabalho.
					</p>
				</div>
				<div className="oe-header-actions">
					<Button variant="secondary" onClick={() => void reload()}>
						Actualizar
					</Button>
					<Button onClick={startNew} disabled={!types.length}>
						Novo objecto
					</Button>
				</div>
			</header>
			<div className="oe-metrics">
				<MetricCard label="Objectos visíveis" value={filtered.length} />
				<MetricCard
					label="Em progresso"
					value={
						filtered.filter((item) => item.statusCategory === "IN_PROGRESS")
							.length
					}
				/>
				<MetricCard
					label="Bloqueados"
					value={
						filtered.filter((item) => item.statusCategory === "BLOCKED").length
					}
				/>
				<MetricCard
					emphasis
					label="Concluídos"
					value={
						filtered.filter((item) => item.statusCategory === "DONE").length
					}
				/>
			</div>
			<div className="oe-toolbar">
				<SearchField
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Pesquisar no trabalho"
					aria-label="Pesquisar no trabalho"
				/>
				<SelectPill
					value={typeFilter}
					onChange={(event) => setTypeFilter(event.target.value)}
					aria-label="Filtrar por tipo"
					placeholder="Todos os tipos"
				>
					<option value="">Todos os tipos</option>
					{types.map((type) => (
						<option key={type.key} value={type.key}>
							{type.name}
						</option>
					))}
				</SelectPill>
				<SelectPill
					value={statusFilter}
					onChange={(event) => setStatusFilter(event.target.value)}
					aria-label="Filtrar por estado"
					placeholder="Todos os estados"
				>
					<option value="">Todos os estados</option>
					{Object.entries(statusLabel).map(([key, label]) => (
						<option key={key} value={key}>
							{label}
						</option>
					))}
				</SelectPill>
				<SegmentedTabs
					value={view}
					onChange={(value) => setView(value as ViewMode)}
					items={views}
				/>
			</div>
			{error ? (
				<p className="oe-alert" role="alert">
					{error}
				</p>
			) : null}
			{notice ? (
				<p className="oe-notice" role="status">
					{notice}
				</p>
			) : null}
			<div className="oe-layout">
				<InvertedPanel className="oe-work-surface">
					{filtered.length === 0 ? (
						<EmptyState
							title="Nenhum resultado"
							detail="Ajuste os filtros ou crie um novo objecto."
							action={<Button onClick={startNew}>Criar objecto</Button>}
						/>
					) : view === "list" ? (
						<div className="oe-list">
							{filtered.map((object) => (
								<DataRow
									key={object.id}
									primary={object.title}
									secondary={`${object.humanId} · ${date(object.dueAt)}`}
									status={
										<StatusChip state={tone(object.statusCategory)}>
											{statusLabel[object.statusCategory]}
										</StatusChip>
									}
									amount={priorityLabel[object.priority]}
									avatarName={object.typeKey}
									selected={object.id === selectedId}
									onClick={() => void loadDetail(object.id)}
								/>
							))}
						</div>
					) : view === "board" ? (
						<div className="oe-board">
							<WorkBoardDnd
								columns={columns}
								selectedId={selectedId}
								onSelect={(id) => void loadDetail(id)}
								onMove={moveObject}
							/>
						</div>
					) : view === "calendar" ? (
						<div className="oe-calendar">
							{dated.map((object) => (
								<button
									type="button"
									className="oe-calendar-row"
									key={object.id}
									onClick={() => void loadDetail(object.id)}
								>
									<time>{date(object.dueAt ?? object.startAt)}</time>
									<span>
										<strong>{object.title}</strong>
										<small>{object.humanId}</small>
									</span>
									<StatusChip state={tone(object.statusCategory)}>
										{statusLabel[object.statusCategory]}
									</StatusChip>
								</button>
							))}
						</div>
					) : (
						<div className="oe-timeline">
							{history.length ? (
								history.map((item) => (
									<article key={item.id} className="oe-history-item">
										<span className="oe-history-dot" aria-hidden="true" />
										<div>
											<p>{item.name}</p>
											{item.fromStatus || item.toStatus ? (
												<strong>
													{item.fromStatus ?? "Novo"} → {item.toStatus}
												</strong>
											) : null}
											<small>{dateTime(item.occurredAt)}</small>
											{item.comment ? <span>{item.comment}</span> : null}
										</div>
									</article>
								))
							) : (
								<EmptyState
									title="Sem histórico neste objecto"
									detail="Abra um objecto para acompanhar a evolução."
								/>
							)}
						</div>
					)}
				</InvertedPanel>
				<aside className="oe-detail" aria-label="Detalhe do objecto">
					{selected || creating ? (
						<Card className="oe-detail-card">
							<div className="oe-detail-head">
								<div>
									<p className="oe-kicker">
										{creating ? "Novo objecto" : selected?.humanId}
									</p>
									<h2>{creating ? "Criar trabalho" : selected?.title}</h2>
								</div>
								{selected ? (
									<StatusChip state={tone(selected.statusCategory)}>
										{statusLabel[selected.statusCategory]}
									</StatusChip>
								) : null}
							</div>
							<div className="oe-form">
								{creating ? (
									<SelectPill
										label="Tipo"
										value={selectedType}
										onChange={(event) => setSelectedType(event.target.value)}
									>
										{types.map((type) => (
											<option key={type.key} value={type.key}>
												{type.name}
											</option>
										))}
									</SelectPill>
								) : null}
								<Input
									label="Título"
									value={title}
									onChange={(event) => setTitle(event.target.value)}
									disabled={Boolean(selected && !selected.permissions.update)}
								/>
								<Textarea
									label="Descrição"
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									rows={4}
									disabled={Boolean(selected && !selected.permissions.update)}
								/>
								<Input
									label="Prazo"
									type="datetime-local"
									value={dueAt}
									onChange={(event) => setDueAt(event.target.value)}
									disabled={Boolean(selected && !selected.permissions.update)}
								/>
								{selected ? (
									<SelectPill
										label="Estado"
										value={selectedStatus}
										onChange={(event) => void updateStatus(event.target.value)}
										disabled={!selected.permissions.update || saving}
									>
										{selectedTypeDef?.statusModel.states.map((state) => (
											<option key={state.key} value={state.key}>
												{state.label}
											</option>
										))}
									</SelectPill>
								) : null}
								<div className="oe-detail-actions">
									<Button
										onClick={() => void saveObject()}
										loading={saving}
										disabled={Boolean(selected && !selected.permissions.update)}
									>
										{creating ? "Criar objecto" : "Guardar alterações"}
									</Button>
									{selected ? (
										<Button
											variant="secondary"
											onClick={() => void assignSelf()}
											disabled={
												!selected.permissions.update ||
												saving ||
												Boolean(
													identity?.user.id &&
														selected.assignments.some(
															(item) =>
																item.userId === identity.user.id &&
																item.role === "ASSIGNEE",
														),
												)
											}
										>
											Atribuir a mim
										</Button>
									) : null}
								</div>
							</div>
							{selected ? (
								<>
									<section className="oe-section">
										<div className="oe-section-head">
											<h3>Assignments</h3>
											<span>{selected.assignments.length}</span>
										</div>
										{selected.assignments.length ? (
											selected.assignments.map((assignment) => (
												<EntityCard
													key={assignment.id}
													name={
														assignment.userId ??
														assignment.agentId ??
														"Principal"
													}
													subtitle={assignment.role}
												/>
											))
										) : (
											<p className="oe-muted">Sem atribuições.</p>
										)}
									</section>
									<section className="oe-section">
										<div className="oe-section-head">
											<h3>Comentários</h3>
											<span>{comments.length}</span>
										</div>
										<div className="oe-comments">
											{comments.map((comment) => (
												<article className="oe-comment" key={comment.id}>
													<EntityCard
														name={comment.authorName}
														subtitle={dateTime(comment.createdAt)}
													/>
													<p>{comment.bodyText}</p>
												</article>
											))}
										</div>
										{selected.permissions.comment ? (
											<div className="oe-comment-compose">
												<Textarea
													value={commentText}
													onChange={(event) =>
														setCommentText(event.target.value)
													}
													rows={3}
													placeholder="Escreva um comentário"
													aria-label="Escreva um comentário"
												/>
												<Button
													variant="secondary"
													onClick={() => void addComment()}
													disabled={!commentText.trim() || saving}
												>
													Comentar
												</Button>
											</div>
										) : null}
									</section>
									<section className="oe-section">
										<div className="oe-section-head">
											<h3>Anexos</h3>
											<span>{attachments.length}</span>
										</div>
										{attachments.map((attachment) => (
											<Card key={attachment.id} className="oe-attachment">
												<div>
													<strong>{attachment.name}</strong>
													<small>
														{attachment.mimeType} ·{" "}
														{Number(attachment.sizeBytes).toLocaleString(
															"pt-PT",
														)}{" "}
														bytes
													</small>
												</div>
											</Card>
										))}
										{selected.permissions.update ? (
											<div className="oe-attachment-add">
												<Input
													value={fileId}
													onChange={(event) => setFileId(event.target.value)}
													placeholder="ID do ficheiro existente"
													aria-label="ID do ficheiro existente"
												/>
												<Button
													variant="secondary"
													onClick={() => void attachFile()}
													disabled={!fileId.trim() || saving}
												>
													Associar
												</Button>
											</div>
										) : null}
									</section>
									<section className="oe-section">
										<div className="oe-section-head">
											<h3>Object context</h3>
										</div>
										<div className="oe-facts">
											<span>{selected.typeKey}</span>
											<span>{priorityLabel[selected.priority]}</span>
											<span>{selected.progress}% concluído</span>
										</div>
									</section>
								</>
							) : null}
						</Card>
					) : (
						<EmptyState
							title="Seleccione um objecto"
							detail="Abra um item para editar e acompanhar o contexto."
							action={<Button onClick={startNew}>Criar objecto</Button>}
						/>
					)}
				</aside>
			</div>
		</section>
	);
}
