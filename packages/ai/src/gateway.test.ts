import { describe, expect, it } from "vitest";
import { extractCitationIds, resolveModel } from "./gateway.js";

describe("AI gateway", () => {
	it("prefers an allowed requested model", () => {
		expect(
			resolveModel(
				{
					allowedModels: ["gpt-test"],
					fallbackModel: "fallback",
					maxClassification: null,
					residencyRegion: null,
					monthlyCapCents: null,
					routingRules: null,
				},
				"gpt-test",
			),
		).toBe("gpt-test");
	});
	it("extracts unique citation identifiers", () => {
		expect(
			extractCitationIds(
				"Fact [page:1] and again [page:1] plus [work_object:2]",
			),
		).toEqual(["page:1", "work_object:2"]);
	});
});
