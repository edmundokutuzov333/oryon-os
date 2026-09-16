"use client";

import { useState } from "react";
import { permissionsCopy as copy } from "./permissions-copy";

type Evaluation = {
	permissions: Record<string, boolean>;
	exposure: { external: { allowed: boolean; reason: string }; ai: { allowed: boolean; reason: string }; export: { allowed: boolean; reason: string }; watermark: boolean; fieldAccess: Record<string, string> };
	decisions: Array<{ action: string; allowed: boolean; reason: string; matchedBy: string | null }>;
	principal: { id: string; email: string; type: string };
};

type Exposure = { resources: Array<{ resourceType: string; resourceId: string; externalPrincipals: number; fieldMasked: boolean }> };

export function PermissionsPanel({ organizationId }: { organizationId: string }) {
	const [mode, setMode] = useState<"evaluate" | "view-as" | "exposure">("evaluate");
	const [resourceType, setResourceType] = useState("work_object");
	const [resourceId, setResourceId] = useState("obj_demo_task_0001");
	const [workspaceId, setWorkspaceId] = useState("ws_demo_0001");
	const [projectId, setProjectId] = useState("");
	const [ownerId, setOwnerId] = useState("usr_demo_admin");
	const [teamId, setTeamId] = useState("");
	const [classification, setClassification] = useState("internal");
	const [fields, setFields] = useState("title,description,moneyAmount");
	const [targetUserId, setTargetUserId] = useState("usr_demo_member");
	const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
	const [exposure, setExposure] = useState<Exposure | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string>();

	function resource() {
		return { orgId: organizationId, type: resourceType.trim(), id: resourceId.trim(), workspaceId: workspaceId.trim() || null, projectId: projectId.trim() || null, ownerId: ownerId.trim() || null, teamId: teamId.trim() || null, classification: classification.trim() || null };
	}

	async function runEvaluation(path: string, body: unknown) {
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
			const payload = (await response.json()) as { data?: Evaluation; error?: { message?: string } };
			if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.executionError);
			setEvaluation(payload.data);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : copy.executionError);
		} finally {
			setBusy(false);
		}
	}

	async function evaluate() {
		await runEvaluation(mode === "view-as" ? "/api/permissions/view-as" : "/api/permissions/evaluate", {
			...(mode === "view-as" ? { targetUserId } : {}),
			resource: resource(),
			external: true,
			ai: true,
			fields: fields.split(",").map((value) => value.trim()).filter(Boolean),
		});
	}

	async function loadExposure() {
		setBusy(true);
		setError(undefined);
		try {
			const response = await fetch("/api/permissions/exposure", { cache: "no-store" });
			const payload = (await response.json()) as { data?: Exposure; error?: { message?: string } };
			if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.executionError);
			setExposure(payload.data);
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : copy.executionError);
		} finally {
			setBusy(false);
		}
	}

	return (
		<section className="permissions-layout" aria-label={copy.title}>
			<header className="permissions-header">
				<div><p className="panel-kicker">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="permissions-subtitle">{copy.subtitle}</p></div>
				<a className="quiet-link" href="/os">{copy.back}</a>
			</header>
			<nav className="permissions-tabs" aria-label={copy.title}>
				<button type="button" className={mode === "evaluate" ? "permission-tab active" : "permission-tab"} onClick={() => setMode("evaluate")}>{copy.evaluate}</button>
				<button type="button" className={mode === "view-as" ? "permission-tab active" : "permission-tab"} onClick={() => setMode("view-as")}>{copy.viewAs}</button>
				<button type="button" className={mode === "exposure" ? "permission-tab active" : "permission-tab"} onClick={() => { setMode("exposure"); void loadExposure(); }}>{copy.exposure}</button>
			</nav>
			{mode !== "exposure" ? (
				<div className="permission-workbench">
					<form className="permission-form" onSubmit={(event) => { event.preventDefault(); void evaluate(); }}>
						<label><span>{copy.resourceType}</span><input value={resourceType} onChange={(event) => setResourceType(event.target.value)} required /></label>
						<label><span>{copy.resourceId}</span><input value={resourceId} onChange={(event) => setResourceId(event.target.value)} required /></label>
						<label><span>{copy.workspaceId}</span><input value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} /></label>
						<label><span>{copy.projectId} <small>({copy.optional})</small></span><input value={projectId} onChange={(event) => setProjectId(event.target.value)} /></label>
						<label><span>{copy.ownerId} <small>({copy.optional})</small></span><input value={ownerId} onChange={(event) => setOwnerId(event.target.value)} /></label>
						<label><span>{copy.teamId} <small>({copy.optional})</small></span><input value={teamId} onChange={(event) => setTeamId(event.target.value)} /></label>
						<label><span>{copy.classification}</span><input value={classification} onChange={(event) => setClassification(event.target.value)} /></label>
						<label><span>{copy.fields}</span><input value={fields} onChange={(event) => setFields(event.target.value)} /></label>
						{mode === "view-as" ? <label><span>{copy.targetUser}</span><input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} required /></label> : null}
						<button type="submit" disabled={busy}>{busy ? copy.busy : mode === "view-as" ? copy.simulate : copy.run}</button>
					</form>
					<div className="permission-result" aria-live="polite">
						{error ? <p className="permission-error" role="alert">{error}</p> : null}
						{evaluation ? (
							<>
								<div className="permission-principal"><span>{copy.principal}</span><strong>{evaluation.principal.email}</strong><code>{evaluation.principal.id}</code></div>
								<div className="permission-action-grid">{Object.entries(evaluation.permissions).map(([action, allowed]) => <div className={allowed ? "permission-state allow" : "permission-state deny"} key={action}><span>{action}</span><strong>{allowed ? copy.allowed : copy.denied}</strong></div>)}</div>
								<div className="exposure-strip">
									<div><span>{copy.external}</span><strong>{evaluation.exposure.external.allowed ? copy.allowed : copy.denied}</strong><small>{evaluation.exposure.external.reason}</small></div>
									<div><span>{copy.ai}</span><strong>{evaluation.exposure.ai.allowed ? copy.allowed : copy.denied}</strong><small>{evaluation.exposure.ai.reason}</small></div>
									<div><span>{copy.export}</span><strong>{evaluation.exposure.export.allowed ? copy.allowed : copy.denied}</strong><small>{evaluation.exposure.export.reason}</small></div>
									<div><span>{copy.watermark}</span><strong>{evaluation.exposure.watermark ? copy.allowed : copy.denied}</strong><small>{copy.classificationSource}</small></div>
								</div>
								<div className="field-access"><p className="panel-kicker">{copy.fieldAccess}</p>{Object.entries(evaluation.exposure.fieldAccess).map(([field, state]) => <div className="list-item" key={field}><code>{field}</code><span>{state}</span></div>)}</div>
							</>
						) : <p className="permissions-empty">{copy.result}</p>}
					</div>
				</div>
			) : (
				<section className="exposure-report">
					<div className="exposure-report-header"><div><p className="panel-kicker">{copy.exposure}</p><h2>{copy.title}</h2></div><button type="button" className="ghost-button" onClick={() => void loadExposure()} disabled={busy}>{copy.loadExposure}</button></div>
					{error ? <p className="permission-error" role="alert">{error}</p> : null}
					{exposure?.resources.length ? <div className="item-list">{exposure.resources.map((row) => <div className="list-item" key={`${row.resourceType}:${row.resourceId}`}><span>{row.resourceType}</span><code>{row.resourceId}</code><span>{row.externalPrincipals}</span><span>{row.fieldMasked ? copy.masked : copy.unmasked}</span></div>)}</div> : <p className="permissions-empty">{copy.noResources}</p>}
				</section>
			)}
		</section>
	);
}
