import { existsSync, readFileSync } from "node:fs";

const design = readFileSync("DESIGN_SYSTEM.md", "utf8");
if (!design.includes("LCP") || !design.includes("INP")) {
	throw new Error("Performance budget documentation missing LCP/INP requirements");
}

const next = "apps/web/.next/BUILD_ID";
if (process.env.CI === "true" && !existsSync(next)) {
	throw new Error("Next build output missing before performance gate");
}

const telemetryPath = process.env.ORYON_RELEASE_TELEMETRY_FILE ?? "docs/release/telemetry.json";
if (process.env.CI === "true" && !existsSync(telemetryPath)) {
	throw new Error(`Release telemetry evidence missing: ${telemetryPath}`);
}

if (process.env.CI === "true") {
	const telemetry = JSON.parse(readFileSync(telemetryPath, "utf8"));
	if (telemetry.status !== "VERIFIED") {
		throw new Error(`Release telemetry status is ${telemetry.status ?? "UNKNOWN"}, expected VERIFIED`);
	}
	const metrics = telemetry.metrics ?? {};
	if (!(Number(metrics.ttfvMinutes) < 10)) throw new Error("TTFV release criterion not verified: expected < 10 minutes");
	if (!(Number(metrics.cmdKInitiatedActionRate) > 0.4)) throw new Error("Cmd-K release criterion not verified: expected > 40%");
	if (metrics.templatesWithoutCode !== true) throw new Error("Template no-code criterion not verified");
	if (metrics.agentsClosingRealWork !== true) throw new Error("Agent real-work criterion not verified");
	if (metrics.customObjectCreation !== true) throw new Error("Custom object creation criterion not verified");
	if (metrics.completeExportWithoutError !== true) throw new Error("Complete export criterion not verified");
}

console.log("Performance and release evidence gate: VERIFIED");
