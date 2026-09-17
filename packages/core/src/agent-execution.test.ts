import { describe, expect, it } from "vitest";
import {
	assertBudget,
	evaluateWorkflowCondition,
	requiresCheckpoint,
} from "./agent-execution.js";

describe("agent execution guards", () => {
	it("requires approval for sensitive work under sensitive-only policy", () =>
		expect(requiresCheckpoint("SENSITIVE_ONLY", true)).toBe(true));
	it("does not require approval for ordinary work under sensitive-only policy", () =>
		expect(requiresCheckpoint("SENSITIVE_ONLY", false)).toBe(false));
	it("considers budget before execution", () =>
		expect(() => assertBudget(10n, 9n, 2n)).toThrow("AI_BUDGET_EXCEEDED"));
	it("evaluates nested workflow conditions", () =>
		expect(
			evaluateWorkflowCondition(
				{ path: "payload.priority", operator: "gte", value: 5 },
				{ payload: { priority: 7 } },
			),
		).toBe(true));
});
