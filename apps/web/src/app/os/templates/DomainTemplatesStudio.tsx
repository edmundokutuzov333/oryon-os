"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, CountBadge, PageHeader, StatusChip } from "@oryon/ui";
import type {
	DomainTemplateManifest,
	DomainTemplateSummary,
} from "@oryon/contracts/domain-templates";
import "./templates.css";

const COPY = {
	eyebrow: "OryonOS / Domain Templates",
	title: "Equipas prontas, motor único.",
	description:
		"Active um domínio operacional sem criar uma aplicação paralela. CRM, Support e Product / Engineering usam WorkObject, estados, campos, relações e permissões do mesmo núcleo.",
	all: "Todos",
	installed: "Activos",
	available: "Disponíveis",
	objectTypes: "tipos de objecto",
	journeys: "jornadas",
	install: "Activar template",
	reactivate: "Reactivar",
	deactivate: "Desactivar",
	loading: "A carregar templates…",
	empty: "Nenhum template corresponde ao filtro actual.",
	conflict:
		"Existe uma definição com uma chave usada pelo template. Os dados existentes foram preservados.",
	active: "Activo",
	inactive: "Inactivo",
	availableStatus: "Disponível",
	details: "O que entra",
	relations: "Relações",
	journeysLabel: "Jornadas",
	types: "Tipos",
	close: "Fechar detalhe",
	installing: "A activar…",
	deactivating: "A desactivar…",
	refreshed: "Estado actualizado.",
	noAccess: "Sem acesso a esta área.",
};

type Filter = "ALL" | "INSTALLED" | "AVAILABLE";

type StatusState = "positive" | "warning" | "danger" | "neutral" | "info";

function statusLabel(status: DomainTemplateSummary["status"]): string {
	if (status === "INSTALLED") return COPY.active;
	if (status === "INACTIVE") return COPY.inactive;
	return COPY.availableStatus;
}

function statusState(status: DomainTemplateSummary["status"]): StatusState {
	if (status === "INSTALLED") return "positive";
	if (status === "INACTIVE") return "warning";
	return "neutral";
}

export function DomainTemplatesStudio() {
	const [templates, setTemplates] = useState<DomainTemplateSummary[]>([]);
	const [manifests, setManifests] = useState<
		Map<string, DomainTemplateManifest>
	>(new Map());
	const [filter, setFilter] = useState<Filter>("ALL");
	const [selectedKey, setSelectedKey] = useState<string | null>(null);
	const [busyKey, setBusyKey] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const load = async () => {
		setError(null);
		const response = await fetch("/api/domain-templates", {
			cache: "no-store",
		});
		if (!response.ok) {
			setError(response.status === 403 ? COPY.noAccess : COPY.empty);
			return;
		}
		const payload = (await response.json()) as {
			data: DomainTemplateSummary[];
		};
		setTemplates(payload.data);
		const next = new Map<string, DomainTemplateManifest>();
		await Promise.all(
			payload.data.map(async (item) => {
				const detailResponse = await fetch(
					`/api/domain-templates/${item.key}`,
					{ cache: "no-store" },
				);
				if (detailResponse.ok) {
					const detail = (await detailResponse.json()) as {
						data: DomainTemplateManifest;
					};
					next.set(item.key, detail.data);
				}
			}),
		);
		setManifests(next);
	};

	useEffect(() => {
		void load();
	}, []);

	const visible = useMemo(
		() =>
			templates.filter((template) => {
				if (filter === "INSTALLED") return template.status === "INSTALLED";
				if (filter === "AVAILABLE") return template.status !== "INSTALLED";
				return true;
			}),
		[filter, templates],
	);

	const selectedSummary = selectedKey
		? templates.find((template) => template.key === selectedKey)
		: undefined;
	const selected = selectedSummary
		? (manifests.get(selectedSummary.key) ?? null)
		: null;

	const act = async (key: string, action: "install" | "deactivate") => {
		setBusyKey(key);
		setError(null);
		setNotice(null);
		try {
			const response = await fetch(`/api/domain-templates/${key}/${action}`, {
				method: "POST",
				headers: {
					"Idempotency-Key": crypto.randomUUID(),
					"Content-Type": "application/json",
				},
				body: "{}",
			});
			const payload = (await response.json()) as {
				error?: { message?: string };
			};
			if (!response.ok) throw new Error(payload.error?.message ?? COPY.empty);
			await load();
			setNotice(COPY.refreshed);
		} catch (cause) {
			setError(
				cause instanceof Error && cause.message.includes("CONFLICT")
					? COPY.conflict
					: cause instanceof Error
						? cause.message
						: COPY.empty,
			);
		} finally {
			setBusyKey(null);
		}
	};

	return (
		<main className="domain-template-page">
			<PageHeader title={COPY.title} description={COPY.description} />
			<div className="domain-template-toolbar" aria-label={COPY.all}>
				<div
					className="domain-template-filters"
					role="tablist"
					aria-label={COPY.all}
				>
					<Button
						type="button"
						size="sm"
						variant={filter === "ALL" ? "primary" : "secondary"}
						onClick={() => setFilter("ALL")}
					>
						{COPY.all}
					</Button>
					<Button
						type="button"
						size="sm"
						variant={filter === "INSTALLED" ? "primary" : "secondary"}
						onClick={() => setFilter("INSTALLED")}
					>
						{COPY.installed}
					</Button>
					<Button
						type="button"
						size="sm"
						variant={filter === "AVAILABLE" ? "primary" : "secondary"}
						onClick={() => setFilter("AVAILABLE")}
					>
						{COPY.available}
					</Button>
				</div>
				<span className="domain-template-count">
					<CountBadge>{visible.length}</CountBadge> {COPY.types}
				</span>
			</div>

			{error ? (
				<Card className="domain-template-feedback domain-template-error">
					<p>{error}</p>
				</Card>
			) : null}
			{notice ? (
				<Card className="domain-template-feedback">
					<p>{notice}</p>
				</Card>
			) : null}
			{!templates.length && !error ? (
				<Card className="domain-template-feedback">
					<p>{COPY.loading}</p>
				</Card>
			) : null}
			{templates.length > 0 && visible.length === 0 ? (
				<Card className="domain-template-feedback">
					<p>{COPY.empty}</p>
				</Card>
			) : null}

			<section className="domain-template-grid" aria-live="polite">
				{visible.map((template) => (
					<Card key={template.key} className="domain-template-card">
						<div className="domain-template-card-top">
							<span className="domain-template-icon" aria-hidden="true">
								{template.icon}
							</span>
							<StatusChip state={statusState(template.status)}>
								{statusLabel(template.status)}
							</StatusChip>
						</div>
						<div>
							<div className="domain-template-title-row">
								<h2>{template.name}</h2>
								<span className="domain-template-version">
									v{template.version}
								</span>
							</div>
							<p className="domain-template-summary">
								{template.shortDescription}
							</p>
						</div>
						<div className="domain-template-metrics">
							<span>
								<strong>{template.objectTypeCount}</strong> {COPY.objectTypes}
							</span>
							<span>
								<strong>{template.journeyCount}</strong> {COPY.journeys}
							</span>
						</div>
						<p className="domain-template-audience">{template.audience}</p>
						<div className="domain-template-actions">
							<Button
								type="button"
								size="sm"
								variant="secondary"
								onClick={() => setSelectedKey(template.key)}
							>
								{COPY.details}
							</Button>
							{template.status === "INSTALLED" ? (
								<Button
									type="button"
									size="sm"
									variant="secondary"
									disabled={busyKey === template.key}
									onClick={() => void act(template.key, "deactivate")}
								>
									{busyKey === template.key
										? COPY.deactivating
										: COPY.deactivate}
								</Button>
							) : (
								<Button
									type="button"
									size="sm"
									variant="primary"
									disabled={busyKey === template.key}
									onClick={() => void act(template.key, "install")}
								>
									{busyKey === template.key
										? COPY.installing
										: template.status === "INACTIVE"
											? COPY.reactivate
											: COPY.install}
								</Button>
							)}
						</div>
					</Card>
				))}
			</section>

			{selected ? (
				<section className="domain-template-detail" aria-label={selected.name}>
					<Card className="domain-template-detail-card">
						<div className="domain-template-detail-header">
							<div>
								<span className="domain-template-detail-kicker">
									{COPY.details}
								</span>
								<h2>{selected.name}</h2>
								<p>{selected.description}</p>
							</div>
							<Button
								type="button"
								size="sm"
								variant="secondary"
								onClick={() => setSelectedKey(null)}
							>
								{COPY.close}
							</Button>
						</div>
						<div className="domain-template-detail-body">
							<div className="domain-template-detail-section">
								<h3>{COPY.types}</h3>
								<div className="domain-template-chip-grid">
									{selected.objectTypes.map((type) => (
										<div className="domain-template-type-chip" key={type.key}>
											<strong>{type.name}</strong>
											<span>{type.pluralName}</span>
											<code>{type.key}</code>
										</div>
									))}
								</div>
							</div>
							<div className="domain-template-detail-section">
								<h3>{COPY.relations}</h3>
								<div className="domain-template-list">
									{selected.relations.map((relation) => (
										<div
											key={`${relation.fromTypeKey}-${relation.toTypeKey}-${relation.relation}`}
											className="domain-template-list-row"
										>
											<code>{relation.fromTypeKey}</code>
											<span>{relation.label}</span>
											<code>{relation.toTypeKey}</code>
										</div>
									))}
								</div>
							</div>
							<div className="domain-template-detail-section">
								<h3>{COPY.journeysLabel}</h3>
								<div className="domain-template-list">
									{selected.journeys.map((journey) => (
										<div key={journey.key} className="domain-template-journey">
											<div>
												<strong>{journey.name}</strong>
												<p>{journey.description}</p>
											</div>
											<span>
												{journey.steps.map((step) => step.label).join(" → ")}
											</span>
										</div>
									))}
								</div>
							</div>
						</div>
					</Card>
				</section>
			) : null}
		</main>
	);
}
