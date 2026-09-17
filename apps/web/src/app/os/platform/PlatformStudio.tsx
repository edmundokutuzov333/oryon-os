"use client";
import { useState } from "react";
import type {
	ApiKeyCreated,
	ApiKeySummary,
	WebhookSummary,
} from "@oryon/contracts/platform-release";
import "./platform.css";

type Props = {
	initialKeys: ApiKeySummary[];
	initialWebhooks: WebhookSummary[];
	audit: Array<Record<string, unknown>>;
};
export default function PlatformStudio({
	initialKeys,
	initialWebhooks,
	audit,
}: Props) {
	const [keys, setKeys] = useState<ApiKeySummary[]>(initialKeys);
	const [webhooks, setWebhooks] = useState<WebhookSummary[]>(initialWebhooks);
	const [secret, setSecret] = useState("");
	const [label, setLabel] = useState("Integração externa");
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [notice, setNotice] = useState("");
	async function request(path: string, options: RequestInit = {}) {
		const response = await fetch(`/api/platform/${path}`, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...(options.headers ?? {}),
			},
		});
		const payload = (await response.json()) as {
			data?: unknown;
			error?: { message?: string };
		};
		if (!response.ok)
			throw new Error(payload.error?.message ?? "Operação não concluída");
		return payload.data;
	}
	async function createKey() {
		setBusy(true);
		setNotice("");
		try {
			const item = (await request("api-keys", {
				method: "POST",
				body: JSON.stringify({ label }),
			})) as ApiKeyCreated;
			setKeys((current) => [...current, item]);
			setSecret(item.secret);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Erro de plataforma");
		} finally {
			setBusy(false);
		}
	}
	async function createWebhook() {
		setBusy(true);
		setNotice("");
		try {
			const item = (await request("webhooks", {
				method: "POST",
				body: JSON.stringify({ url, events: ["*"] }),
			})) as WebhookSummary;
			setWebhooks((current) => [...current, item]);
			setUrl("");
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Erro de plataforma");
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="platform-shell">
			<header className="platform-header">
				<div>
					<span className="platform-eyebrow">PLATFORM</span>
					<h1>Platform &amp; Release</h1>
					<p>Governança, integrações, auditoria e operações de produção.</p>
				</div>
				<span className="platform-phase">FASE 15</span>
			</header>
			{notice ? (
				<div className="platform-notice" role="alert">
					{notice}
				</div>
			) : null}
			<section className="platform-grid">
				<article>
					<span>API keys</span>
					<strong>{keys.filter((item) => !item.revokedAt).length}</strong>
					<small>service accounts activas</small>
				</article>
				<article>
					<span>Webhooks</span>
					<strong>{webhooks.filter((item) => item.active).length}</strong>
					<small>endpoints activos</small>
				</article>
				<article>
					<span>Audit</span>
					<strong>{audit.length}</strong>
					<small>entradas recentes</small>
				</article>
			</section>
			<section className="platform-columns">
				<div className="platform-card">
					<div className="platform-card-head">
						<h2>Service accounts</h2>
						<p>Credenciais para integrações sem expor sessões humanas.</p>
					</div>
					<div className="platform-form">
						<input
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							aria-label="Nome da integração"
						/>
						<button
							type="button"
							disabled={busy || label.length < 2}
							onClick={createKey}
						>
							Criar chave
						</button>
					</div>
					{secret ? (
						<div className="platform-secret" role="status">
							<b>Guarde esta chave agora</b>
							<code>{secret}</code>
							<small>A secret não volta a ser mostrada.</small>
						</div>
					) : null}
					<div className="platform-list">
						{keys.map((key) => (
							<div key={key.id}>
								<span>
									<b>{key.label}</b>
									<small>{key.prefix}</small>
								</span>
								<span>{key.revokedAt ? "Revogada" : "Activa"}</span>
							</div>
						))}
					</div>
				</div>
				<div className="platform-card">
					<div className="platform-card-head">
						<h2>Webhooks</h2>
						<p>Eventos assinados para sistemas externos.</p>
					</div>
					<div className="platform-form">
						<input
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							placeholder="https://example.com/webhooks"
							aria-label="URL do webhook"
						/>
						<button
							type="button"
							disabled={busy || url.length < 8}
							onClick={createWebhook}
						>
							Adicionar
						</button>
					</div>
					<div className="platform-list">
						{webhooks.map((hook) => (
							<div key={hook.id}>
								<span>
									<b>{hook.url}</b>
									<small>{hook.events.join(", ")}</small>
								</span>
								<span>{hook.active ? "Activo" : "Pausado"}</span>
							</div>
						))}
					</div>
				</div>
			</section>
			<section className="platform-card platform-audit">
				<div className="platform-card-head">
					<h2>Audit trail</h2>
					<p>Actividade administrativa recente.</p>
				</div>
				<div className="platform-list">
					{audit.map((row, index) => (
						<div key={String(row.id ?? index)}>
							<span>
								<b>{String(row.action ?? "event")}</b>
								<small>
									{String(row.resourceType ?? "resource")} /{" "}
									{String(row.resourceId ?? "")}
								</small>
							</span>
							<span>{String(row.decision ?? "ALLOW")}</span>
						</div>
					))}
				</div>
			</section>
		</div>
	);
}
