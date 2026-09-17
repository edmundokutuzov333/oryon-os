"use client";

import { useEffect, useMemo, useState } from "react";
import { GraphEdgeCreateInputSchema, GraphTraverseResponseSchema, type GraphRelation, type GraphTraverseResponse } from "@oryon/contracts/graph";
import { WorkObjectResponseSchema, type WorkObjectResponse } from "@oryon/contracts/work-object";
import { graphCopy, graphRelations } from "./graph-copy";

type Mode = "network" | "customer360";

type Point = { x: number; y: number };

function nodePoint(index: number, total: number): Point {
	if (index === 0) return { x: 450, y: 300 };
	const angle = ((index - 1) / Math.max(total - 1, 1)) * Math.PI * 2 - Math.PI / 2;
	const radiusX = 315;
	const radiusY = 205;
	return { x: 450 + Math.cos(angle) * radiusX, y: 300 + Math.sin(angle) * radiusY };
}

function labelForRelation(relation: GraphRelation): string {
	return relation.replaceAll("_", " ").toLocaleLowerCase("pt-PT");
}

function displayOwner(object: WorkObjectResponse | undefined): string {
	return object?.ownerId ?? "";
}

export function GraphStudio() {
	const [objects, setObjects] = useState<WorkObjectResponse[]>([]);
	const [rootId, setRootId] = useState("");
	const [graph, setGraph] = useState<GraphTraverseResponse>();
	const [mode, setMode] = useState<Mode>("network");
	const [direction, setDirection] = useState<"out" | "in" | "both">("both");
	const [depth, setDepth] = useState(2);
	const [relation, setRelation] = useState<GraphRelation | "*">("*");
	const [targetId, setTargetId] = useState("");
	const [newRelation, setNewRelation] = useState<GraphRelation>("RELATES_TO");
	const [busy, setBusy] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();
	const [message, setMessage] = useState<string>();

	const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);
	const graphObjects = useMemo(() => graph?.nodes.filter((node) => node.type === "work_object") ?? [], [graph]);
	const rootObject = objectById.get(rootId);

	async function request(path: string, init?: RequestInit): Promise<unknown> {
		const response = await fetch(path, { ...init, cache: "no-store" });
		const payload = (await response.json()) as { data?: unknown; error?: { message?: string } };
		if (!response.ok || payload.data === undefined) {
			const backendMessage = payload.error?.message;
			if (backendMessage === "CYCLE_DETECTED") throw new Error(graphCopy.cycle);
			if (backendMessage === "CONFLICT") throw new Error(graphCopy.conflict);
			if (backendMessage === "PERMISSION_DENIED") throw new Error(graphCopy.permission);
			throw new Error(backendMessage ?? graphCopy.error);
		}
		return payload.data;
	}

	async function loadObjects(): Promise<void> {
		const data = await request("/api/work-objects?limit=100");
		const parsed = WorkObjectResponseSchema.array().parse(data);
		setObjects(parsed);
		setRootId((current) => current || parsed[0]?.id || "");
		setTargetId((current) => current || parsed.find((object) => object.id !== (parsed[0]?.id ?? ""))?.id || "");
	}

	async function loadGraph(nextRootId = rootId): Promise<void> {
		if (!nextRootId) return;
		setBusy(true);
		setError(undefined);
		try {
			const effectiveDepth = mode === "customer360" ? Math.max(depth, 3) : depth;
			const query = new URLSearchParams({ rootType: "work_object", rootId: nextRootId, depth: String(effectiveDepth), direction, relation, includeTimeline: "true" });
			const data = await request(`/api/graph?${query.toString()}`);
			setGraph(GraphTraverseResponseSchema.parse(data));
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : graphCopy.error);
		} finally {
			setBusy(false);
		}
	}

	async function refresh(): Promise<void> {
		setBusy(true);
		setError(undefined);
		try {
			await loadObjects();
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : graphCopy.error);
		} finally {
			setBusy(false);
		}
	}

	useEffect(() => {
		void refresh();
	}, []);

	useEffect(() => {
		if (rootId) void loadGraph(rootId);
	}, [rootId, direction, depth, relation, mode]);

	async function connect(): Promise<void> {
		if (!rootId || !targetId || rootId === targetId) return;
		setSaving(true);
		setError(undefined);
		setMessage(undefined);
		try {
			const input = GraphEdgeCreateInputSchema.parse({ from: { type: "work_object", id: rootId }, to: { type: "work_object", id: targetId }, relation: newRelation, metadata: {} });
			await request("/api/edges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
			setMessage(graphCopy.connected);
			await loadGraph(rootId);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : graphCopy.error);
		} finally {
			setSaving(false);
		}
	}

	const positions = useMemo(() => new Map(graphObjects.map((node, index) => [node.id, nodePoint(index, graphObjects.length)])), [graphObjects]);

	if (busy && objects.length === 0) return <section className="graph-studio"><div className="graph-empty" role="status" aria-live="polite">{graphCopy.loading}</div></section>;

	return (
		<section className="graph-studio" aria-label={graphCopy.title}>
			<header className="graph-header">
				<div>
					<p className="graph-kicker">{graphCopy.eyebrow.toLocaleLowerCase("pt-PT")}</p>
					<h1>{graphCopy.title}</h1>
					<p className="graph-subtitle">{graphCopy.subtitle}</p>
				</div>
				<div className="graph-header-actions">
					<button type="button" className="ghost-button" onClick={() => void refresh()} disabled={busy}>{graphCopy.refresh}</button>
				</div>
			</header>

			<div className="graph-tabs" role="tablist" aria-label={graphCopy.title}>
				<button type="button" role="tab" aria-selected={mode === "network"} className={mode === "network" ? "graph-tab active" : "graph-tab"} onClick={() => setMode("network")}>{graphCopy.network}</button>
				<button type="button" role="tab" aria-selected={mode === "customer360"} className={mode === "customer360" ? "graph-tab active" : "graph-tab"} onClick={() => setMode("customer360")}>{graphCopy.customer360}</button>
			</div>

			<div className="graph-controls">
				<label><span>{graphCopy.object}</span><select value={rootId} onChange={(event) => setRootId(event.target.value)} disabled={objects.length === 0}>{objects.map((object) => <option key={object.id} value={object.id}>{object.humanId} · {object.title}</option>)}</select></label>
				<label><span>{graphCopy.direction}</span><select value={direction} onChange={(event) => setDirection(event.target.value as "out" | "in" | "both") }><option value="both">{graphCopy.both}</option><option value="out">{graphCopy.outgoing}</option><option value="in">{graphCopy.incoming}</option></select></label>
				<label><span>{graphCopy.depth}</span><select value={depth} onChange={(event) => setDepth(Number(event.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></label>
				<label><span>{graphCopy.relations}</span><select value={relation} onChange={(event) => setRelation(event.target.value as GraphRelation | "*")}><option value="*">{graphCopy.allRelations}</option>{graphRelations.map((item) => <option key={item} value={item}>{labelForRelation(item)}</option>)}</select></label>
			</div>

			{error ? <p className="graph-error" role="alert">{error}</p> : null}
			{message ? <p className="graph-success" role="status" aria-live="polite">{message}</p> : null}

			<div className="graph-layout">
				<section className="graph-canvas-panel" aria-label={graphCopy.network} aria-busy={busy}>
					<div className="graph-canvas-meta"><span>{graph?.meta.visibleNodeCount ?? 0} {graphCopy.nodeCount}</span><span>{graph?.edges.length ?? 0} {graphCopy.edgeCount}</span>{graph?.meta.truncated ? <span>{graphCopy.truncated}</span> : null}{busy ? <span>{graphCopy.loading}</span> : null}</div>
					{graph && graph.nodes.length > 0 ? <svg className="graph-canvas" viewBox="0 0 900 620" role="img" aria-label={graphCopy.network}>
						{graph.edges.map((edge) => {
							const from = positions.get(edge.from.id);
							const to = positions.get(edge.to.id);
							if (!from || !to) return null;
							return <g key={edge.id}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y} className="graph-edge" /><text x={(from.x + to.x) / 2} y={(from.y + to.y) / 2 - 8} className="graph-edge-label">{labelForRelation(edge.relation)}</text></g>;
						})}
						{graphObjects.map((node, index) => {
							const point = positions.get(node.id);
							if (!point || !("humanId" in node) || !("title" in node)) return null;
							const active = node.id === rootId;
							return <g key={node.id} className={active ? "graph-node active" : "graph-node"} onClick={() => setRootId(node.id)} role="button" tabIndex={0} aria-label={`${node.humanId} ${node.title}`} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setRootId(node.id); }}>
								<circle cx={point.x} cy={point.y} r={index === 0 ? 58 : 48} />
								<text x={point.x} y={point.y - 6} textAnchor="middle" className="graph-node-id">{node.humanId}</text>
								<text x={point.x} y={point.y + 14} textAnchor="middle" className="graph-node-title">{node.title.length > 23 ? `${node.title.slice(0, 20)}…` : node.title}</text>
							</g>;
						})}
					</svg> : <div className="graph-empty">{graphCopy.noGraph}</div>}
				</section>

				<aside className="graph-side-panel">
					<section className="graph-card">
						<p className="graph-kicker">{graphCopy.selected}</p>
						<h2>{rootObject?.title ?? graphCopy.chooseObject}</h2>
						<div className="graph-facts"><span>{rootObject?.humanId ?? ""}</span><span>{rootObject?.status ?? ""}</span><span>{rootObject?.priority ?? ""}</span></div>
						<dl><div><dt>{graphCopy.owner}</dt><dd>{displayOwner(rootObject)}</dd></div><div><dt>{graphCopy.workspace}</dt><dd>{rootObject?.workspaceId ?? ""}</dd></div><div><dt>{graphCopy.relationshipCount}</dt><dd>{graph?.edges.length ?? 0}</dd></div></dl>
					</section>

					<section className="graph-card"><p className="graph-kicker">{graphCopy.connect}</p><h2>{graphCopy.createRelation}</h2><label><span>{graphCopy.to}</span><select value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={!objects.some((object) => object.id !== rootId)}>{objects.filter((object) => object.id !== rootId).map((object) => <option key={object.id} value={object.id}>{object.humanId} · {object.title}</option>)}</select></label><label><span>{graphCopy.relation}</span><select value={newRelation} onChange={(event) => setNewRelation(event.target.value as GraphRelation)}>{graphRelations.map((item) => <option key={item} value={item}>{labelForRelation(item)}</option>)}</select></label><button type="button" className="graph-primary-button" onClick={() => void connect()} disabled={saving || !targetId || !rootId}>{saving ? graphCopy.newRelation : graphCopy.connect}</button></section>

					<section className="graph-card graph-timeline"><p className="graph-kicker">{mode === "customer360" ? graphCopy.customerContext : graphCopy.timeline}</p>{graph?.timeline.length ? <div className="graph-timeline-list">{graph.timeline.slice(0, 18).map((event) => <button type="button" key={event.id} className="graph-timeline-row" onClick={() => setRootId(event.node.id)}><span className="graph-timeline-time">{new Date(event.occurredAt).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</span><strong>{event.name}</strong><span>{event.fromStatus && event.toStatus ? `${event.fromStatus} → ${event.toStatus}` : graphCopy.journey}</span></button>)}</div> : <div className="graph-empty">{graphCopy.noTimeline}</div>}</section>
				</aside>
			</div>
		</section>
	);
}
