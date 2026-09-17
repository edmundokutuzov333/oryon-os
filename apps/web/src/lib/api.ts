import type { HealthResponse } from "@oryon/contracts/health";
import { HealthResponseSchema } from "@oryon/contracts/health";

const API_URL = process.env.ORYON_API_URL ?? "http://localhost:4000";

export async function getApiHealth(): Promise<HealthResponse> {
	const response = await fetch(`${API_URL}/v1/health`, {
		cache: "no-store",
	});

	if (!response.ok) {
		throw new Error(`Oryon API returned HTTP ${response.status}`);
	}

	const payload: unknown = await response.json();
	if (typeof payload !== "object" || payload === null || !("data" in payload)) {
		throw new Error("Invalid Oryon API health envelope");
	}

	return HealthResponseSchema.parse(payload.data);
}
