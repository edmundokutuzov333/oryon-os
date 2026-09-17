const base = process.env.ORYON_E2E_BASE_URL;
const org = process.env.ORYON_E2E_ORG;
const key = process.env.ORYON_E2E_API_KEY;
if (!base || !org || !key) {
	console.log(
		"Phase 15 E2E: environment not configured, structural gate remains active.",
	);
	process.exit(0);
}
const headers = { "X-Oryon-Org": org, "X-Oryon-Api-Key": key };
const health = await fetch(`${base}/v1/platform/health`, { headers });
if (!health.ok) throw new Error(`platform health failed: ${health.status}`);
const openapi = await fetch(`${base}/openapi.json`);
if (!openapi.ok) throw new Error(`openapi endpoint failed: ${openapi.status}`);
const spec = await openapi.json();
if (spec.openapi !== "3.1.0") throw new Error("OpenAPI version mismatch");
const audit = await fetch(`${base}/v1/platform/audit?limit=1`, { headers });
if (![200, 403].includes(audit.status))
	throw new Error(`audit endpoint unexpected status: ${audit.status}`);
console.log("Phase 15 API E2E smoke: OK");
