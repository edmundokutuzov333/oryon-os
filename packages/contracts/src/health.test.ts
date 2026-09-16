import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./health.schema.js";

describe("health contract", () => {
	it("validates the api health envelope", () => {
		expect(
			HealthResponseSchema.parse({
				status: "ok",
				service: "oryon-api",
				version: "0.1.0",
				timestamp: "2026-09-16T10:00:00+02:00",
			}).status,
		).toBe("ok");
	});
});
