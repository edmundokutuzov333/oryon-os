import { useCallback, useEffect, useMemo, useState } from "react";
import { AiSearchResponseSchema, SearchResponseSchema, type SearchResult } from "@oryon/contracts/search-ai";
import { Button, Card, EmptyState, ErrorState, InvertedPanel, PageHeader, SearchField, SegmentedTabs, StatusChip } from "@oryon/ui";
import "./search.css";

const COPY = {
	title: "Search + AI",
	description: "Pesquisa transversal da OryonOS com recuperação lexical, semântica e respostas fundamentadas.",
	placeholder: "Pesquisar no Work Graph, Docs e Files",
	all: "Tudo",
	work: "Work",
	docs: "Docs",
	files: "Files",
	search: "Pesquisar",
	ask: "Perguntar à Oryon",
	asking: "A responder",
	noResults: "Nenhum resultado",
	noResultsDetail: "A pesquisa não encontrou conteúdo autorizado para esta consulta.",
	error: "Não foi possível pesquisar",
	errorDetail: "Verifique a ligação ao serviço e tente novamente.",
	grounded: "Resposta fundamentada",
	retrieval: "Recuperação",
	semantic: "Semântica",
	lexical: "Texto",
	fallback: "Modo fundamentado local",
	results: "resultados",
} as const;

const TABS = [
	{ value: "all", label: COPY.all },
	{ value: "work_object", label: COPY.work },
	{ value: "page", label: COPY.docs },
	{ value: "file_asset", label: COPY.files },
];

function dataFromEnvelope(payload: unknown) {
	if (!payload || typeof payload !== "object" || !("data" in payload)) throw new Error("INVALID_RESPONSE");
	return (payload as { data: unknown }).data;
}

export function SearchStudio(): React.ReactElement {
	const [query, setQuery] = useState("");
	const [activeTab, setActiveTab] = useState("all");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(false);
	const [aiLoading, setAiLoading] = useState(false);
	const [aiError, setAiError] = useState(false);
	const [ai, setAi] = useState<ReturnType<typeof AiSearchResponseSchema.parse> | null>(null);

	const type = activeTab === "all" ? undefined : activeTab as "work_object" | "page" | "file_asset";
	const runSearch = useCallback(async (value: string) => {
		const normalized = value.trim();
		if (!normalized) { setResults([]); setAi(null); return; }
		setLoading(true);
		setError(false);
		try {
			const params = new URLSearchParams({ q: normalized, limit: "20" });
			if (type) params.set("type", type);
			const response = await fetch(`/api/search/hybrid?${params.toString()}`, { cache: "no-store" });
			if (!response.ok) throw new Error("SEARCH_FAILED");
			setResults(SearchResponseSchema.parse(dataFromEnvelope(await response.json())).results);
		} catch { setError(true); setResults([]); } finally { setLoading(false); }
	}, [type]);

	useEffect(() => {
		const timer = window.setTimeout(() => { void runSearch(query); }, 220);
		return () => window.clearTimeout(timer);
	}, [query, runSearch]);

	const visibleResults = useMemo(() => results.filter((result) => activeTab === "all" || result.type === activeTab), [results, activeTab]);

	async function askOryon(): Promise<void> {
		if (!query.trim() || aiLoading) return;
		setAiLoading(true);
		setAiError(false);
		try {
			const response = await fetch("/api/ai/search", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({ query, mode: "ANSWER", limit: 8, conversationKey: "search-studio" }), cache: "no-store" });
			if (!response.ok) throw new Error("AI_FAILED");
			setAi(AiSearchResponseSchema.parse(dataFromEnvelope(await response.json())));
		} catch { setAiError(true); } finally { setAiLoading(false); }
	}

	return <section className="sa-shell">
		<PageHeader title={COPY.title} description={COPY.description} />
		<div className="sa-query"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder={COPY.placeholder} aria-label={COPY.placeholder} autoComplete="off" /><Button variant="primary" size="lg" onClick={() => { void runSearch(query); }} loading={loading}>{COPY.search}</Button></div>
		<SegmentedTabs value={activeTab} onChange={setActiveTab} items={TABS} />
		{error ? <ErrorState title={COPY.error} detail={COPY.errorDetail} /> : null}
		{aiError ? <ErrorState title={COPY.error} detail={COPY.errorDetail} /> : null}
		{ai ? <InvertedPanel className="sa-answer"><div className="sa-answer-head"><div><span className="sa-kicker">{COPY.grounded}</span><h2>{ai.model ?? COPY.fallback}</h2></div><div className="sa-retrieval"><StatusChip state="neutral">{COPY.lexical} {ai.retrieval.lexical}</StatusChip><StatusChip state="info">{COPY.semantic} {ai.retrieval.semantic}</StatusChip><StatusChip state="positive">{COPY.retrieval} {ai.retrieval.fused}</StatusChip></div></div><p>{ai.answer}</p><div className="sa-citations">{ai.citations.map((citation) => <a key={citation.id} className="sa-citation" href={citation.href}><strong>{citation.title}</strong><span>{citation.snippet}</span></a>)}</div></InvertedPanel> : null}
		<div className="sa-result-head"><span>{loading ? COPY.asking : `${visibleResults.length} ${COPY.results}`}</span><Button variant="secondary" onClick={() => { void askOryon(); }} disabled={loading || aiLoading || visibleResults.length === 0} loading={aiLoading}>{aiLoading ? COPY.asking : COPY.ask}</Button></div>
		{!loading && visibleResults.length === 0 && query.trim() ? <EmptyState title={COPY.noResults} detail={COPY.noResultsDetail} /> : null}
		{!query.trim() ? <EmptyState title={COPY.title} detail={COPY.description} /> : null}
		<div className="sa-results">{visibleResults.map((result) => <Card key={`${result.type}:${result.id}`} interactive className="sa-result"><a href={result.href}><div className="sa-result-top"><StatusChip state="neutral">{result.type}</StatusChip><span className="sa-score">{result.matchedBy.join(" + ")}</span></div><h3>{result.title}</h3><p>{result.snippet}</p><div className="sa-result-bottom"><span>{result.classification ?? ""}</span><span>{result.href}</span></div></a></Card>)}</div>
	</section>;
}
