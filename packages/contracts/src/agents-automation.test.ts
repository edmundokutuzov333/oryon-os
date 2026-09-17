import { describe, expect, it } from "vitest";
import {
	AgentCreateInputSchema,
	CheckpointDecisionSchema,
	WorkflowCreateInputSchema,
} from "./agents-automation.schema.js";

describe("agents automation contracts", () => {
	it("accepts a complete agent payload", () =>
		expect(
			AgentCreateInputSchema.parse({
				key: "ops-agent",
				name: "Operations Agent",
				systemPrompt: "Do the work.",
				knowledgeScope: {},
				tools: [],
				triggers: [],
			}).key,
		).toBe("ops-agent"));
	it("rejects malformed checkpoint decisions", () =>
		expect(() =>
			CheckpointDecisionSchema.parse({ decision: "MAYBE" }),
		).toThrow());
	it("accepts event-triggered workflows", () =>
		expect(
			WorkflowCreateInputSchema.parse({
				key: "notify",
				name: "Notify",
				trigger: { kind: "EVENT", eventName: "work_object.created" },
				steps: [
					{
						id: "check",
						name: "Check",
						type: "CONDITION",
						condition: { path: "priority", operator: "gte", value: 5 },
					},
				],
			}).trigger.kind,
		).toBe("EVENT"));
});
