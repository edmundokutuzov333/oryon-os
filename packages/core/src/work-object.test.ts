import { describe, expect, it } from "vitest";
import {
	generateHumanId,
	prepareWorkObjectCreate,
	transitionStatus,
	validateCustomFields,
	validateWorkObjectDates,
} from "./work-object.js";

const typeDef = {
	id: "type_task",
	key: "task",
	name: "Task",
	pluralName: "Tasks",
	icon: null,
	isSystem: true,
	idPrefix: "TASK",
	schema: {
		fields: [
			{ key: "effort", label: "Effort", type: "NUMBER" as const, required: true },
			{ key: "stage", label: "Stage", type: "SELECT" as const, required: false, options: [{ key: "a", label: "A" }, { key: "b", label: "B" }] },
		],
	},
	statusModel: {
		initial: "todo",
		states: [
			{ key: "todo", label: "To do", category: "TODO" as const, order: 0 },
			{ key: "doing", label: "Doing", category: "IN_PROGRESS" as const, order: 1 },
			{ key: "done", label: "Done", category: "DONE" as const, order: 2 },
		],
		transitions: [{ from: "todo", to: "doing" }, { from: "doing", to: "done" }],
	},
};

describe("work object domain", () => {
	it("validates custom fields against the type definition", () => {
		expect(validateCustomFields(typeDef.schema, { effort: 3, stage: "a" })).toEqual({ effort: 3, stage: "a" });
		expect(() => validateCustomFields(typeDef.schema, { effort: 3, unknown: true })).toThrow(/Unknown custom field/);
		expect(() => validateCustomFields(typeDef.schema, { stage: "a" })).toThrow(/Required custom field/);
	});

	it("enforces status transitions", () => {
		expect(transitionStatus(typeDef.statusModel, "todo", { status: "doing" })).toMatchObject({ status: "doing", statusCategory: "IN_PROGRESS" });
		expect(() => transitionStatus(typeDef.statusModel, "todo", { status: "done" })).toThrow(/Transition not allowed/);
	});

	it("rejects invalid date ranges", () => {
		expect(() => validateWorkObjectDates("2026-09-20T12:00:00+02:00", "2026-09-19T12:00:00+02:00")).toThrow(/startAt/);
	});

	it("prepares omitted status from the type model", () => {
		const prepared = prepareWorkObjectCreate({ typeKey: "task", title: "Ship V1", customFields: { effort: 3 } }, typeDef);
		expect(prepared.status).toBe("todo");
	});

	it("generates stable human ids from universal object ids", () => {
		expect(generateHumanId("clxyz123456789", "TASK")).toBe("TASK-23456789");
	});
});
