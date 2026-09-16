export const ORYON_AI_VERSION = "1.0.0" as const;

export type AiPolicy = {
	allowedModels: readonly string[];
	fallbackModel: string;
	maxClassification: string | null;
	residencyRegion: string | null;
	monthlyCapCents: bigint | null;
	routingRules: unknown;
};

export type AiGatewayConfig = {
	baseUrl: string;
	apiKey: string;
	model: string;
	embeddingModel: string;
	maxContextChars: number;
};

export type ChatSource = { id: string; title: string; text: string };

function envNumber(name: string, fallback: number): number {
	const raw = process.env[name];
	if (!raw) return fallback;
	const value = Number(raw);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveModel(policy: AiPolicy | null, preferred?: string): string {
	if (preferred && (!policy || policy.allowedModels.includes(preferred))) return preferred;
	if (policy && policy.allowedModels.length > 0) return policy.allowedModels[0] ?? policy.fallbackModel;
	return preferred ?? policy?.fallbackModel ?? process.env.ORYON_AI_MODEL ?? "";
}

export function gatewayConfig(): AiGatewayConfig | null {
	const apiKey = process.env.ORYON_AI_API_KEY;
	const model = process.env.ORYON_AI_MODEL;
	if (!apiKey || !model) return null;
	return {
		baseUrl: (process.env.ORYON_AI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
		apiKey,
		model,
		embeddingModel: process.env.ORYON_AI_EMBEDDING_MODEL ?? "text-embedding-3-small",
		maxContextChars: envNumber("ORYON_AI_MAX_CONTEXT_CHARS", 18000),
	};
}

async function postJson<T>(url: string, apiKey: string, body: unknown): Promise<T> {
	const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body) });
	if (!response.ok) throw new Error(`AI_PROVIDER_${response.status}`);
	return response.json() as Promise<T>;
}

export async function createEmbedding(text: string, config = gatewayConfig()): Promise<number[] | null> {
	if (!config) return null;
	type Response = { data: Array<{ embedding: number[] }> };
	const response = await postJson<Response>(`${config.baseUrl}/embeddings`, config.apiKey, { model: config.embeddingModel, input: text });
	return response.data[0]?.embedding ?? null;
}

export async function answerWithSources(query: string, sources: readonly ChatSource[], policy: AiPolicy | null, config = gatewayConfig()): Promise<{ answer: string; model: string }> {
	if (!config) throw new Error("AI_NOT_CONFIGURED");
	const model = resolveModel(policy, config.model);
	if (!model) throw new Error("AI_MODEL_NOT_CONFIGURED");
	const context = sources.map((source) => `[${source.id}] ${source.title}\n${source.text}`).join("\n\n").slice(0, config.maxContextChars);
	type Response = { choices?: Array<{ message?: { content?: string } }> };
	const response = await postJson<Response>(`${config.baseUrl}/chat/completions`, config.apiKey, {
		model,
		temperature: 0.1,
		messages: [
			{ role: "system", content: "És o assistente empresarial da OryonOS. Responde apenas com base nas fontes fornecidas. Cita pelo menos uma fonte usando exatamente [source-id]. Não inventes factos nem cites fontes ausentes." },
			{ role: "user", content: `Pergunta: ${query}\n\nFontes autorizadas:\n${context}` },
		],
	});
	const answer = response.choices?.[0]?.message?.content?.trim();
	if (!answer) throw new Error("AI_EMPTY_RESPONSE");
	return { answer, model };
}

export function extractCitationIds(answer: string): string[] {
	return [...new Set([...answer.matchAll(/\[([^\]\n]+)\]/g)].map((match) => match[1]?.trim()).filter((value): value is string => Boolean(value)))];
}
