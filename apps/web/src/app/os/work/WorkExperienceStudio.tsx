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
import { WorkObjectResponseSchema, ObjectTypeDefSchema, type ObjectTypeDefContract, type WorkObjectResponse } from "@oryon/contracts/work-object";
import { WorkObjectAttachmentSchema, WorkObjectCommentSchema, WorkObjectHistoryResponseSchema, type WorkObjectAttachment, type WorkObjectComment, type WorkObjectHistoryEvent } from "@oryon/contracts/work-experience";
import { IdentityContextSchema, type IdentityContext } from "@oryon/contracts/identity";

const statusLabel: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "A fazer",
  IN_PROGRESS: "Em progresso",
  BLOCKED: "Bloqueado",
  IN_REVIEW: "Em revisão",
  DONE: "Concluído",
  CANCELLED: "Cancelado",
};

const priorityLabel: Record<string, string> = { LOWEST: "Muito baixa", LOW: "Baixa", NORMAL: "Normal", HIGH: "Alta", URGENT: "Urgente" };
const viewItems = [
  { value: "list", label: "Lista" },
  { value: "board", label: "Board" },
  { value: "calendar", label: "Calendário" },
  { value: "timeline", label: "Timeline" },
];

type ViewMode = (typeof viewItems)[number]["value"];

type ApiPayload = { data?: unknown; error?: { message?: string } };

function statusTone(category: WorkObjectResponse["statusCategory"]): "positive" | "warning" | "danger" | "neutral" | "info" {
  if (category === "DONE") return "positive";
  if (category === "BLOCKED" || category === "CANCELLED") return "danger";
  if (category === "IN_PROGRESS" || category === "IN_REVIEW") return "info";
  if (category === "BACKLOG") return "neutral";
  return "warning";
}

function formatDate(value: string | null): string {
  if (!value) return "Sem data";
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function apiRequest(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const payload = (await response.json()) as ApiPayload;
  if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? "Operação falhou");
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
  const [selectedStatus, setSelectedStatus] = useState<string>();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [newObject, setNewObject] = useState(false);
  const [comments, setComments] = useState<WorkObjectComment[]>([]);
  const [history, setHistory] = useState<WorkObjectHistoryEvent[]>([]);
  const [attachments, setAttachments] = useState<WorkObjectAttachment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [fileId, setFileId] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const selected = useMemo(() => objects.find((item) => item.id === selectedId), [objects, selectedId]);
  const visibleObjects = useMemo(() => objects.filter((item) => {
    const haystack = `${item.title} ${item.description ?? ""} ${item.humanId} ${item.typeKey}`.toLocaleLowerCase();
    return (!query || haystack.includes(query.toLocaleLowerCase())) && (!typeFilter || item.typeKey === typeFilter) && (!statusFilter || item.statusCategory === statusFilter);
  }), [objects, query, statusFilter, typeFilter]);
  const statusGroups = useMemo(() => {
    const keys = ["BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "DONE", "CANCELLED"] as const;
    return keys.map((key) => ({ key, items: visibleObjects.filter((item) => item.statusCategory === key) })).filter((group) => group.items.length > 0);
  }, [visibleObjects]);
  const dateObjects = useMemo(() => [...visibleObjects].sort((a, b) => (a.dueAt ?? a.startAt ?? "").localeCompare(b.dueAt ?? b.startAt ?? "")), [visibleObjects]);

  async function reload() {
    setBusy(true);
    setError(undefined);
    try {
      const [identityData, typeData, objectData] = await Promise.all([
        apiRequest("/api/auth/session"),
        apiRequest("/api/object-types"),
        apiRequest("/api/work-objects?limit=200"),
      ]);
      const nextIdentity = IdentityContextSchema.parse(identityData);
      const nextTypes = ObjectTypeDefSchema.array().parse(typeData);
      const nextObjects = WorkObjectResponseSchema.array().parse(objectData);
      setIdentity(nextIdentity);
      setTypes(nextTypes);
      setObjects(nextObjects);
      setSelectedId((current) => current && nextObjects.some((item) => item.id === current) ? current : nextObjects[0]?.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível carregar o trabalho");
    } finally {
      setBusy(false);
    }
  }

  async function loadDetail(id: string) {
    setSelectedId(id);
    setError(undefined);
    try {
      const [objectData, commentData, historyData, attachmentData] = await Promise.all([
        apiRequest(`/api/work-objects/${encodeURIComponent(id)}`),
        apiRequest(`/api/work-objects/${encodeURIComponent(id)}/comments`),
        apiRequest(`/api/work-objects/${encodeURIComponent(id)}/history`),
        apiRequest(`/api/work-objects/${encodeURIComponent(id)}/attachments`),
      ]);
      const object = WorkObjectResponseSchema.parse(objectData);
      setObjects((current) => current.some((item) => item.id === id) ? current.map((item) => item.id === id ? object : item) : [object, ...current]);
      setSelectedStatus(object.status);
      setTitle(object.title);
      setDescription(object.description ?? "");
      setSelectedType(object.typeKey);
      setDueAt(object.dueAt ? object.dueAt.slice(0, 16) : "");
      setComments(WorkObjectCommentSchema.array().parse(commentData));
      setHistory(WorkObjectHistoryResponseSchema.parse(historyData));
      setAttachments(WorkObjectAttachmentSchema.array().parse(attachmentData));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível abrir o objecto");
    }
  }

  useEffect(() => { void reload(); }, []);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, []);

  async function saveObject() {
    if (!selectedType || !title.trim()) return;
    setSaving(true);
    setError(undefined);
    try {
      const body = { title: title.trim(), description: description || null, dueAt: dueAt ? new Date(dueAt).toISOString() : null };
      const data = newObject
        ? await apiRequest("/api/work-objects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ typeKey: selectedType, workspaceId: identity?.workspaces[0]?.id ?? null, ...body }) })
        : selectedId
          ? await apiRequest(`/api/work-objects/${encodeURIComponent(selectedId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
          : null;
      if (!data) throw new Error("Não existe objecto seleccionado");
      const object = WorkObjectResponseSchema.parse(data);
      setObjects((current) => newObject ? [object, ...current] : current.map((item) => item.id === object.id ? object : item));
      setSelectedId(object.id);
      setNewObject(false);
      setNotice(newObject ? "Objecto criado" : "Objecto actualizado");
      await loadDetail(object.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível guardar o objecto");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(status: string) {
    if (!selected?.permissions.update || status === selected.status) return;
    setSaving(true);
    setError(undefined);
    try {
      const data = await apiRequest(`/api/work-objects/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const object = WorkObjectResponseSchema.parse(data);
      setObjects((current) => current.map((item) => item.id === object.id ? object : item));
      setSelectedStatus(object.status);
      setHistory(WorkObjectHistoryResponseSchema.parse(await apiRequest(`/api/work-objects/${encodeURIComponent(object.id)}/history`)));
      setNotice("Estado actualizado");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível alterar o estado");
    } finally {
      setSaving(false);
    }
  }

  async function addComment() {
    if (!selected || !commentText.trim() || !selected.permissions.comment) return;
    setSaving(true);
    setError(undefined);
    try {
      const data = await apiRequest(`/api/work-objects/${encodeURIComponent(selected.id)}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bodyText: commentText.trim(), mentions: [], isInternal: false }) });
      const comment = WorkObjectCommentSchema.parse(data);
      setComments((current) => [...current, comment]);
      setCommentText("");
      setNotice("Comentário adicionado");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível adicionar o comentário");
    } finally {
      setSaving(false);
    }
  }

  async function assignSelf() {
    if (!selected || !selected.permissions.update || !identity?.user.id) return;
    setSaving(true);
    try {
      const data = await apiRequest(`/api/work-objects/${encodeURIComponent(selected.id)}/assignments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: identity.user.id, role: "ASSIGNEE", allocation: 100 }) });
      const assignmentId = (data as { id: string }).id;
      const object = WorkObjectResponseSchema.parse(await apiRequest(`/api/work-objects/${encodeURIComponent(selected.id)}`));
      setObjects((current) => current.map((item) => item.id === object.id ? object : item));
      setNotice(assignmentId ? "Você foi atribuído" : "Atribuição actualizada");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível atribuir o trabalho");
    } finally {
      setSaving(false);
    }
  }

  async function attachExistingFile() {
    if (!selected || !fileId.trim() || !selected.permissions.update) return;
    setSaving(true);
    try {
      await apiRequest(`/api/work-objects/${encodeURIComponent(selected.id)}/attachments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileId: fileId.trim() }) });
      const data = await apiRequest(`/api/work-objects/${encodeURIComponent(selected.id)}/attachments`);
      setAttachments(WorkObjectAttachmentSchema.array().parse(data));
      setFileId("");
      setNotice("Anexo associado");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Não foi possível associar o anexo");
    } finally {
      setSaving(false);
    }
  }

  function startNew() {
    setNewObject(true);
    setSelectedId(undefined);
    setSelectedStatus(undefined);
    setTitle("");
    setDescription("");
    setDueAt("");
    setSelectedType(types[0]?.key ?? "");
    setComments([]);
    setHistory([]);
    setAttachments([]);
    setNotice(undefined);
  }

  if (busy) return <section className="oe-shell"><Card><div className="oe-loading" aria-label="A carregar trabalho" /></Card></section>;
  if (error && objects.length === 0) return <section className="oe-shell"><ErrorState title="O trabalho não carregou" detail={error} action={<Button onClick={() => void reload()}>Tentar novamente</Button>} /></section>;

  return (
    <section className="oe-shell" aria-label="Experiência de trabalho">
      <header className="oe-header">
        <div><p className="oe-kicker">Work Experience</p><h1>Trabalho</h1><p>Uma única vista para descobrir, mover, atribuir e concluir trabalho.</p></div>
        <div className="oe-header-actions"><Button variant="secondary" onClick={() => void reload()}>Actualizar</Button><Button onClick={startNew} disabled={!types.length}>Novo objecto</Button></div>
      </header>

      <div className="oe-metrics">
        <MetricCard label="Objectos visíveis" value={visibleObjects.length} />
        <MetricCard label="Em progresso" value={visibleObjects.filter((item) => item.statusCategory === "IN_PROGRESS").length} />
        <MetricCard label="Bloqueados" value={visibleObjects.filter((item) => item.statusCategory === "BLOCKED").length} />
        <MetricCard emphasis label="Concluídos" value={visibleObjects.filter((item) => item.statusCategory === "DONE").length} />
      </div>

      <div className="oe-toolbar">
        <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar no trabalho" aria-label="Pesquisar no trabalho" />
        <SelectPill value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Filtrar por tipo" placeholder="Todos os tipos"><option value="">Todos os tipos</option>{types.map((type) => <option key={type.key} value={type.key}>{type.name}</option>)}</SelectPill>
        <SelectPill value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por estado" placeholder="Todos os estados"><option value="">Todos os estados</option>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</SelectPill>
        <SegmentedTabs value={view} onChange={(value) => setView(value as ViewMode)} items={viewItems} />
      </div>

      {error ? <p className="oe-alert" role="alert">{error}</p> : null}
      {notice ? <p className="oe-notice" role="status">{notice}</p> : null}

      <div className="oe-layout">
        <InvertedPanel className="oe-work-surface">
          {visibleObjects.length === 0 ? (
            <EmptyState title="Nenhum resultado" detail="Ajuste os filtros ou crie um novo objecto de trabalho." action={<Button onClick={startNew}>Criar objecto</Button>} />
          ) : view === "list" ? (
            <div className="oe-list">{visibleObjects.map((object) => <DataRow key={object.id} primary={object.title} secondary={`${object.humanId} · ${formatDate(object.dueAt)}`} status={<StatusChip state={statusTone(object.statusCategory)}>{statusLabel[object.statusCategory]}</StatusChip>} amount={priorityLabel[object.priority]} avatarName={object.typeKey} selected={object.id === selectedId} onClick={() => void loadDetail(object.id)} />)}</div>
          ) : view === "board" ? (
            <div className="oe-board">{statusGroups.map((group) => <section className="oe-column" key={group.key} aria-label={statusLabel[group.key]}><header><div><strong>{statusLabel[group.key]}</strong><span>{group.items.length}</span></div></header>{group.items.map((object) => <button className={object.id === selectedId ? "oe-task oe-task-selected" : "oe-task"} key={object.id} type="button" onClick={() => void loadDetail(object.id)}><strong>{object.title}</strong><span>{object.humanId}</span><StatusChip state={statusTone(object.statusCategory)}>{priorityLabel[object.priority]}</StatusChip><small>{formatDate(object.dueAt)}</small></button>)}</section>)}</div>
          ) : view === "calendar" ? (
            <div className="oe-calendar">{dateObjects.map((object) => <button type="button" className="oe-calendar-row" key={object.id} onClick={() => void loadDetail(object.id)}><time>{formatDate(object.dueAt ?? object.startAt)}</time><span><strong>{object.title}</strong><small>{object.humanId}</small></span><StatusChip state={statusTone(object.statusCategory)}>{statusLabel[object.statusCategory]}</StatusChip></button>)}</div>
          ) : (
            <div className="oe-timeline">{history.length === 0 ? <EmptyState title="Sem histórico neste objecto" detail="As alterações aparecerão aqui à medida que o trabalho evolui." /> : history.map((item) => <article key={item.id} className="oe-history-item"><span className="oe-history-dot" aria-hidden="true" /><div><p>{item.name}</p>{item.fromStatus || item.toStatus ? <strong>{item.fromStatus ?? "Novo"} → {item.toStatus}</strong> : null}<small>{formatDateTime(item.occurredAt)}</small>{item.comment ? <span>{item.comment}</span> : null}</div></article>)}</div>
          )}
        </InvertedPanel>

        <aside className="oe-detail" aria-label="Detalhe do objecto">
          {selected || newObject ? (
            <Card className="oe-detail-card">
              <div className="oe-detail-head"><div><p className="oe-kicker">{newObject ? "Novo objecto" : selected?.humanId}</p><h2>{newObject ? "Criar trabalho" : selected?.title}</h2></div>{selected && <StatusChip state={statusTone(selected.statusCategory)}>{statusLabel[selected.statusCategory]}</StatusChip>}</div>
              <div className="oe-form">
                {newObject ? <SelectPill label="Tipo" value={selectedType} onChange={(event) => setSelectedType(event.target.value)} disabled={!types.length}><option value="">Seleccionar tipo</option>{types.map((type) => <option key={type.key} value={type.key}>{type.name}</option>)}</SelectPill> : null}
                <Input label="Título" value={title} onChange={(event) => setTitle(event.target.value)} disabled={Boolean(selected && !selected.permissions.update && !newObject)} />
                <Textarea label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
                <Input label="Prazo" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                {selected ? <SelectPill label="Estado" value={selectedStatus ?? selected.status} onChange={(event) => void updateStatus(event.target.value)} disabled={!selected.permissions.update || saving}>{Object.entries(statusLabel).map(([key, label]) => <option key={key} value={selected.typeKey && selected.typeKey.length > 0 ? selected.status === key || selected.statusCategory === key ? selected.status : key : key}>{label}</option>)}</SelectPill> : null}
                <div className="oe-detail-actions"><Button onClick={() => void saveObject()} loading={saving} disabled={Boolean(selected && !selected.permissions.update)}>{newObject ? "Criar objecto" : "Guardar alterações"}</Button>{selected ? <Button variant="secondary" onClick={() => void assignSelf()} disabled={!selected.permissions.update || saving}>Atribuir a mim</Button> : null}</div>
              </div>

              {selected ? <>
                <section className="oe-section"><div className="oe-section-head"><h3>Assignments</h3><span>{selected.assignments.length}</span></div>{selected.assignments.length ? selected.assignments.map((assignment) => <EntityCard key={assignment.id} name={assignment.userId ?? assignment.agentId ?? "Principal"} subtitle={assignment.role} />) : <p className="oe-muted">Sem atribuições.</p>}</section>

                <section className="oe-section"><div className="oe-section-head"><h3>Comentários</h3><span>{comments.length}</span></div><div className="oe-comments">{comments.length ? comments.map((comment) => <article className="oe-comment" key={comment.id}><EntityCard name={comment.authorName} subtitle={formatDateTime(comment.createdAt)} /><p>{comment.bodyText}</p></article>) : <p className="oe-muted">Ainda não existem comentários.</p>}</div>{selected.permissions.comment ? <div className="oe-comment-compose"><Textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} rows={3} placeholder="Escreva um comentário" aria-label="Escreva um comentário" /><Button variant="secondary" onClick={() => void addComment()} disabled={!commentText.trim() || saving}>Comentar</Button></div> : null}</section>

                <section className="oe-section"><div className="oe-section-head"><h3>Anexos</h3><span>{attachments.length}</span></div>{attachments.length ? attachments.map((attachment) => <Card key={attachment.id} className="oe-attachment"><div><strong>{attachment.name}</strong><small>{attachment.mimeType} · {Number(attachment.sizeBytes).toLocaleString("pt-PT")} bytes</small></div></Card>) : <p className="oe-muted">Sem anexos.</p>}{selected.permissions.update ? <div className="oe-attachment-add"><Input value={fileId} onChange={(event) => setFileId(event.target.value)} placeholder="ID do ficheiro existente" aria-label="ID do ficheiro existente" /><Button variant="secondary" onClick={() => void attachExistingFile()} disabled={!fileId.trim() || saving}>Associar</Button></div> : null}</section>

                <section className="oe-section"><div className="oe-section-head"><h3>Object context</h3></div><div className="oe-facts"><span>{selected.typeKey}</span><span>{priorityLabel[selected.priority]}</span><span>{selected.progress}% concluído</span>{selected.workspaceId ? <span>{selected.workspaceId}</span> : null}</div></section>
              </> : null}
            </Card>
          ) : <EmptyState title="Seleccione um objecto" detail="Abra um item da lista para editar e acompanhar todo o contexto." action={<Button onClick={startNew}>Criar objecto</Button>} />}
        </aside>
      </div>
    </section>
  );
}
