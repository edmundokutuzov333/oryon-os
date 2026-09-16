"use client";

import { useEffect, useMemo, useState } from "react";
import { IdentityContextSchema, type IdentityContext } from "@oryon/contracts/identity";
import { ObjectTypeDefSchema, type ObjectTypeDefContract, type WorkObjectResponse, WorkObjectResponseSchema } from "@oryon/contracts/work-object";
import { fieldTypeOptions, priorityOptions, workCopy } from "./work-copy";

type Mode = "objects" | "types";
type FieldDraft = { key: string; label: string; type: (typeof fieldTypeOptions)[number]; required: boolean };

const emptyField: FieldDraft = { key: "", label: "", type: "TEXT", required: false };

function priorityLabel(value: string): string {
	const labels: Record<string, string> = { LOWEST: "Lowest", LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
	return labels[value] ?? value;
}

function statusCategory(key: string): "BACKLOG" | "TODO" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE" | "CANCELLED" {
	const value = key.toLowerCase();
	if (value.includes("done") || value.includes("complete") || value.includes("conclu")) return "DONE";
	if (value.includes("cancel")) return "CANCELLED";
	if (value.includes("progress") || value.includes("doing") || value.includes("active")) return "IN_PROGRESS";
	if (value.includes("review")) return "IN_REVIEW";
	if (value.includes("block")) return "BLOCKED";
	if (value.includes("backlog")) return "BACKLOG";
	return "TODO";
}

function toIso(value: string): string | null {
	return value ? new Date(value).toISOString() : null;
}

export function WorkObjectStudio() {
	const [identity, setIdentity] = useState<IdentityContext>();
	const [types, setTypes] = useState<ObjectTypeDefContract[]>([]);
	const [objects, setObjects] = useState<WorkObjectResponse[]>([]);
	const [selectedId, setSelectedId] = useState<string>();
	const [mode, setMode] = useState<Mode>("objects");
	const [editingId, setEditingId] = useState<string>();
	const [typeKey, setTypeKey] = useState("");
	const [workspaceId, setWorkspaceId] = useState("");
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<(typeof priorityOptions)[number]>("NORMAL");
	const [dueAt, setDueAt] = useState("");
	const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
	const [newType, setNewType] = useState({ key: "", name: "", pluralName: "", idPrefix: "" });
	const [statusLines, setStatusLines] = useState("open|Aberto\nin_progress|Em progresso\ndone|Concluído");
	const [transitionLines, setTransitionLines] = useState("open>in_progress\nin_progress>done");
	const [fieldDrafts, setFieldDrafts] = useState<FieldDraft[]>([{ ...emptyField }]);
	const [busy, setBusy] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();
	const [message, setMessage] = useState<string>();

	const selected = useMemo(() => objects.find((object) => object.id === selectedId), [objects, selectedId]);
	const selectedType = useMemo(() => types.find((type) => type.key === (editingId ? selected?.typeKey : typeKey)), [editingId, selected, typeKey, types]);

	async function request(path: string, init?: RequestInit): Promise<unknown> {
		const response = await fetch(path, { ...init, cache: "no-store" });
		const payload = (await response.json()) as { data?: unknown; error?: { message?: string } };
		if (!response.ok || payload.data === undefined) throw new Error(payload.error?.message ?? workCopy.error);
		return payload.data;
	}

	async function reload() {
		setBusy(true);
		setError(undefined);
		try {
			const [identityData, typeData] = await Promise.all([request("/api/auth/session"), request("/api/object-types")]);
			const nextIdentity = IdentityContextSchema.parse(identityData);
			const nextTypes = ObjectTypeDefSchema.array().parse(typeData);
			setIdentity(nextIdentity);
			setTypes(nextTypes);
			setWorkspaceId((current) => current || nextIdentity.workspaces[0]?.id || "");
			setTypeKey((current) => current || nextTypes[0]?.key || "");
			const workspace = nextIdentity.workspaces[0];
			const data = await request(`/api/work-objects?limit=100${workspace ? `&workspaceId=${encodeURIComponent(workspace.id)}` : ""}`);
			const nextObjects = WorkObjectResponseSchema.array().parse(data);
			setObjects(nextObjects);
			setSelectedId((current) => current && nextObjects.some((object) => object.id === current) ? current : nextObjects[0]?.id);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : workCopy.error);
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => { void reload(); }, []);

	function startCreate() {
		setEditingId(undefined);
		setSelectedId(undefined);
		setTitle("");
		setDescription("");
		setPriority("NORMAL");
		setDueAt("");
		setCustomFields({});
		setMessage(undefined);
		setMode("objects");
	}

	function editObject(object: WorkObjectResponse) {
		setEditingId(object.id);
		setSelectedId(object.id);
		setTypeKey(object.typeKey);
		setWorkspaceId(object.workspaceId ?? identity?.workspaces[0]?.id ?? "");
		setTitle(object.title);
		setDescription(object.description ?? "");
		setPriority(object.priority);
		setDueAt(object.dueAt ? object.dueAt.slice(0, 16) : "");
		setCustomFields(object.customFields);
	}

	async function saveObject() {
		setSaving(true);
		setError(undefined);
		setMessage(undefined);
		try {
			const body = { typeKey, workspaceId: workspaceId || null, title, description: description || null, priority, dueAt: toIso(dueAt), customFields };
			const data = editingId
				? await request("/api/work-object", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId, ...body }) })
				: await request("/api/work-objects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
			const object = WorkObjectResponseSchema.parse(data);
			setObjects((current) => editingId ? current.map((item) => item.id === object.id ? object : item) : [object, ...current]);
			setSelectedId(object.id);
			setEditingId(object.id);
			setMessage(workCopy.success);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : workCopy.error);
		} finally {
			setSaving(false);
		}
	}

	async function changeStatus(value: string) {
		if (!selected?.permissions.update) return;
		setSaving(true);
		setError(undefined);
		try {
			const data = await request("/api/work-object", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id, status: value }) });
			const object = WorkObjectResponseSchema.parse(data);
			setObjects((current) => current.map((item) => item.id === object.id ? object : item));
			setMessage(workCopy.success);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : workCopy.error);
		} finally {
			setSaving(false);
		}
	}

	async function deleteObject() {
		if (!selected?.permissions.delete) return;
		setSaving(true);
		setError(undefined);
		try {
			await request("/api/work-object", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: selected.id }) });
			setObjects((current) => current.filter((item) => item.id !== selected.id));
			startCreate();
			setMessage(workCopy.success);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : workCopy.error);
		} finally {
			setSaving(false);
		}
	}

	async function createType() {
		setSaving(true);
		setError(undefined);
		try {
			const states = statusLines.split("\n").map((line, order) => line.trim()).filter(Boolean).map((line) => {
				const [key, label] = line.split("|").map((value) => value.trim());
				return { key, label: label || key, category: statusCategory(key), order };
			});
			if (!states[0]?.key) throw new Error(workCopy.invalidStatusModel);
			const transitions = transitionLines.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
				const [from, to] = line.split(">", 2).map((value) => value.trim());
				return { from, to };
			});
			await request("/api/object-types", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...newType, schema: { fields: fieldDrafts.filter((field) => field.key && field.label) }, statusModel: { initial: states[0].key, states, transitions } }) });
			setNewType({ key: "", name: "", pluralName: "", idPrefix: "" });
			setFieldDrafts([{ ...emptyField }]);
			setMessage(workCopy.success);
			setMode("objects");
			await reload();
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : workCopy.error);
		} finally {
			setSaving(false);
		}
	}

	if (busy) return <section className="work-studio"><div className="work-empty">{workCopy.loading}</div></section>;

	return (
		<section className="work-studio" aria-label={workCopy.title}>
			<header className="work-studio-header">
				<div><p className="panel-kicker">{workCopy.eyebrow}</p><h1>{workCopy.title}</h1><p className="work-studio-lede">{workCopy.subtitle}</p></div>
				<div className="work-header-actions"><button type="button" className="ghost-button" onClick={() => void reload()} disabled={saving}>{workCopy.refresh}</button><button type="button" className="work-primary-button" onClick={startCreate}>{workCopy.newObject}</button></div>
			</header>
			<div className="work-tabs" role="tablist" aria-label={workCopy.title}><button type="button" role="tab" aria-selected={mode === "objects"} className={mode === "objects" ? "work-tab active" : "work-tab"} onClick={() => setMode("objects")}>{workCopy.objects}</button><button type="button" role="tab" aria-selected={mode === "types"} className={mode === "types" ? "work-tab active" : "work-tab"} onClick={() => setMode("types")}>{workCopy.types}</button></div>
			{error ? <p className="work-error" role="alert">{error}</p> : null}
			{message ? <p className="work-success" role="status">{message}</p> : null}
			{mode === "objects" ? <div className="work-grid">
				<section className="work-list-panel" aria-label={workCopy.objects}><div className="work-panel-head"><div><p className="panel-kicker">{workCopy.engineStatus}</p><strong>{workCopy.engineDescription}</strong></div><span className="work-count">{objects.length}</span></div>{objects.length ? <div className="work-object-list">{objects.map((object) => <button type="button" key={object.id} className={object.id === selectedId ? "work-object-row active" : "work-object-row"} onClick={() => editObject(object)}><div><span>{object.typeKey}</span><strong>{object.title}</strong></div><div className="work-row-meta"><code>{object.humanId}</code><span>{object.status}</span></div></button>)}</div> : <div className="work-empty">{workCopy.noObjects}</div>}</section>
				<section className="work-editor" aria-label={selected ? workCopy.selectedObject : workCopy.newObject}><div className="work-editor-head"><div><p className="panel-kicker">{editingId ? workCopy.selectedObject : workCopy.newObject}</p><h2>{editingId ? selected?.humanId : workCopy.newObject}</h2></div>{selected?.permissions.delete ? <button type="button" className="work-danger-button" onClick={() => void deleteObject()} disabled={saving}>{saving ? workCopy.deleting : workCopy.delete}</button> : null}</div>
					<div className="work-form-grid"><label><span>{workCopy.type}</span><select value={typeKey} onChange={(event) => { setTypeKey(event.target.value); setCustomFields({}); }} disabled={Boolean(editingId)}>{types.map((type) => <option value={type.key} key={type.id}>{type.name}</option>)}</select></label><label><span>{workCopy.workspace}</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>{identity?.workspaces.map((workspace) => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</select></label><label className="span-2"><span>{workCopy.titleField}</span><input value={title} onChange={(event) => setTitle(event.target.value)} required /></label><label className="span-2"><span>{workCopy.description}</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} /></label><label><span>{workCopy.priority}</span><select value={priority} onChange={(event) => setPriority(event.target.value as typeof priorityOptions[number])}>{priorityOptions.map((option) => <option value={option} key={option}>{priorityLabel(option)}</option>)}</select></label><label><span>{workCopy.dueAt}</span><input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} /></label>{editingId && selected ? <label><span>{workCopy.status}</span><select value={selected.status} onChange={(event) => void changeStatus(event.target.value)} disabled={saving || !selected.permissions.update}>{selectedType?.statusModel.states.map((state) => <option value={state.key} key={state.key}>{state.label}</option>)}</select></label> : null}</div>
					{selectedType ? <div className="work-custom-fields"><p className="panel-kicker">{workCopy.customFields}</p>{selectedType.schema.fields.length ? selectedType.schema.fields.map((field) => <label key={field.key}><span>{field.label}{field.required ? workCopy.requiredMark : ""}</span>{field.type === "BOOLEAN" ? <input type="checkbox" checked={Boolean(customFields[field.key])} onChange={(event) => setCustomFields((current) => ({ ...current, [field.key]: event.target.checked }))} /> : field.type === "SELECT" ? <select value={String(customFields[field.key] ?? "")} onChange={(event) => setCustomFields((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">{workCopy.optional}</option>{field.options?.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}</select> : field.type === "MULTI_SELECT" ? <input value={Array.isArray(customFields[field.key]) ? customFields[field.key].join(", ") : ""} onChange={(event) => setCustomFields((current) => ({ ...current, [field.key]: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} /> : <input type={field.type === "NUMBER" ? "number" : field.type === "DATE" ? "datetime-local" : "text"} value={field.type === "DATE" && typeof customFields[field.key] === "string" ? String(customFields[field.key]).slice(0, 16) : String(customFields[field.key] ?? "")} onChange={(event) => setCustomFields((current) => ({ ...current, [field.key]: field.type === "NUMBER" ? Number(event.target.value) : field.type === "DATE" ? toIso(event.target.value) : event.target.value }))} required={field.required} />}</label>) : <p className="work-muted">{workCopy.noTypes}</p>}</div> : null}
					<div className="work-editor-footer">{selected ? <div className="work-object-facts"><span><code>{selected.humanId}</code></span><span>{selected.statusCategory}</span><span>{selected.progress}%</span><span>{selected.ownerId ?? workCopy.emptyValue}</span></div> : null}<button type="button" className="work-primary-button" onClick={() => void saveObject()} disabled={saving || !title.trim() || !typeKey}>{saving ? (editingId ? workCopy.updating : workCopy.creating) : (editingId ? workCopy.update : workCopy.create)}</button></div></section>
			</div> : <div className="type-builder-grid"><section className="type-builder-form"><div><p className="panel-kicker">{workCopy.newType}</p><h2>{workCopy.types}</h2></div><label><span>{workCopy.key}</span><input value={newType.key} onChange={(event) => setNewType({ ...newType, key: event.target.value })} /></label><label><span>{workCopy.name}</span><input value={newType.name} onChange={(event) => setNewType({ ...newType, name: event.target.value })} /></label><label><span>{workCopy.pluralName}</span><input value={newType.pluralName} onChange={(event) => setNewType({ ...newType, pluralName: event.target.value })} /></label><label><span>{workCopy.idPrefix}</span><input value={newType.idPrefix} onChange={(event) => setNewType({ ...newType, idPrefix: event.target.value.toUpperCase() })} /></label><label><span>{workCopy.statuses}</span><textarea rows={7} value={statusLines} onChange={(event) => setStatusLines(event.target.value)} /></label><label><span>{workCopy.transitions}</span><textarea rows={7} value={transitionLines} onChange={(event) => setTransitionLines(event.target.value)} /></label><div className="type-field-list"><div className="work-panel-head"><div><p className="panel-kicker">{workCopy.fields}</p></div><button type="button" className="ghost-button" onClick={() => setFieldDrafts((current) => [...current, { ...emptyField }])}>{workCopy.addField}</button></div>{fieldDrafts.map((field, index) => <div className="type-field-row" key={`${index}-${field.key}`}><input aria-label={workCopy.fieldKey} value={field.key} onChange={(event) => setFieldDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} /><input aria-label={workCopy.fieldLabel} value={field.label} onChange={(event) => setFieldDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} /><select aria-label={workCopy.fieldType} value={field.type} onChange={(event) => setFieldDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as typeof field.type } : item))}>{fieldTypeOptions.map((option) => <option value={option} key={option}>{option}</option>)}</select><label className="type-required"><input type="checkbox" checked={field.required} onChange={(event) => setFieldDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))} /><span>{workCopy.required}</span></label></div>)}</div><button type="button" className="work-primary-button" onClick={() => void createType()} disabled={saving || !newType.key || !newType.name || !newType.pluralName || !newType.idPrefix}>{saving ? workCopy.creatingType : workCopy.createType}</button></section><section className="type-catalog"><p className="panel-kicker">{workCopy.types}</p><div className="type-catalog-list">{types.map((type) => <article className="type-catalog-card" key={type.id}><div><code>{type.idPrefix}</code><h3>{type.name}</h3><p>{type.pluralName}</p></div><div className="type-card-meta"><span>{type.schema.fields.length} {workCopy.fields.toLowerCase()}</span><span>{type.statusModel.states.length} {workCopy.statuses.toLowerCase()}</span></div></article>)}</div></section></div>}
		</section>
	);
}
