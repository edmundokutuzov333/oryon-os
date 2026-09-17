import {
	ApiKeySummarySchema,
	WebhookSummarySchema,
} from "@oryon/contracts/platform-release";
export async function getPlatformData(
	apiUrl: string,
	org: string,
	cookie: string,
) {
	const headers = { "X-Oryon-Org": org, Cookie: cookie };
	const [keysResponse, hooksResponse, auditResponse] = await Promise.all([
		fetch(`${apiUrl}/v1/platform/api-keys`, { headers, cache: "no-store" }),
		fetch(`${apiUrl}/v1/platform/webhooks`, { headers, cache: "no-store" }),
		fetch(`${apiUrl}/v1/platform/audit?limit=12`, {
			headers,
			cache: "no-store",
		}),
	]);
	if (!keysResponse.ok || !hooksResponse.ok || !auditResponse.ok)
		throw new Error("PLATFORM_ACCESS_DENIED");
	const keys = ApiKeySummarySchema.array().parse(
		((await keysResponse.json()) as { data: unknown }).data,
	);
	const webhooks = WebhookSummarySchema.array().parse(
		((await hooksResponse.json()) as { data: unknown }).data,
	);
	const audit = (
		(await auditResponse.json()) as { data: Array<Record<string, unknown>> }
	).data;
	return { keys, webhooks, audit };
}
