import {
	ObjectStatusModelSchema,
	ObjectTypeSchemaConfig,
	type ObjectTypeDefContract,
	type WorkObjectCreateInput,
	type WorkObjectStatusInput,
	type WorkObjectUpdateInput,
} from "@oryon/contracts/work-object";
import { z } from "zod";

export class WorkObjectDomainError extends Error {
	readonly code: "INVALID_CUSTOM_FIELDS" | "INVALID_STATUS" | "INVALID_TRANSITION" | "INVALID_DATES" | "INVALID_PROGRESS" | "INVALID_MONEY" | "INVALID_PARENT";

	constructor(code: WorkObjectDomainError["code"], message: string) {
		super(message);
		this.name = "WorkObjectDomainError";
		this.code = code;
	}
}

export function validateStatusModel(input: ObjectTypeDefContract["statusModel"]): ObjectTypeDefContract["statusModel"] {
	const model = ObjectStatusModelSchema.parse(input);
	const stateKeys = new Set<string>();
	for (const state of model.states) {
		if (stateKeys.has(state.key)) throw new WorkObjectDomainError("INVALID_STATUS", `Duplicate status: ${state.key}`);
		stateKeys.add(state.key);
	}
	if (!stateKeys.has(model.initial)) throw new WorkObjectDomainError("INVALID_STATUS", `Initial status does not exist: ${model.initial}`);
	for (const transition of model.transitions) {
		if (!stateKeys.has(transition.from) || !stateKeys.has(transition.to)) {
			throw new WorkObjectDomainError("INVALID_TRANSITION", `Transition references an unknown status: ${transition.from} -> ${transition.to}`);
		}
	}
	return model;
}

function fieldSchema(definition: z.infer<typeof ObjectTypeSchemaConfig>['fields'][number]): z.ZodType {
	switch (definition.type) {
		case "TEXT":
			return z.string();
		case "NUMBER":
			return z.number();
		case "BOOLEAN":
			return z.boolean();
		case "DATE":
			return z.string().datetime({ offset: true });
		case "SELECT":
			return definition.options?.length ? z.enum(definition.options.map((option) => option.key) as [string, ...string[]]) : z.string();
		case "MULTI_SELECT":
			return (definition.options?.length
				? z.array(z.enum(definition.options.map((option) => option.key) as [string, ...string[]]))
				: z.array(z.string()));
		case "USER":
			return z.string().min(1);
		case "OBJECT":
			return z.string().min(1);
	}
}

export function validateCustomFields(config: ObjectTypeSchemaConfig, customFields: Record<string, unknown>): Record<string, unknown> {
	const definitionKeys = new Set(config.fields.map((field) => field.key));
	for (const key of Object.keys(customFields)) {
		if (!definitionKeys.has(key)) throw new WorkObjectDomainError("INVALID_CUSTOM_FIELDS", `Unknown custom field: ${key}`);
	}
	const output: Record<string, unknown> = {};
	for (const field of config.fields) {
		const value = customFields[field.key];
		if (value === undefined) {
			if (field.required) throw new WorkObjectDomainError("INVALID_CUSTOM_FIELDS", `Required custom field missing: ${field.key}`);
			continue;
		}
		const parsed = fieldSchema(field).safeParse(value);
		if (!parsed.success) throw new WorkObjectDomainError("INVALID_CUSTOM_FIELDS", `Invalid custom field: ${field.key}`);
		output[field.key] = parsed.data;
	}
	return output;
}

export function transitionStatus(modelInput: ObjectTypeDefContract["statusModel"], currentStatus: string, input: WorkObjectStatusInput): { status: string; statusCategory: ObjectTypeDefContract["statusModel"]["states"][number]["category"] } {
	const model = validateStatusModel(modelInput);
	const current = model.states.find((state) => state.key === currentStatus);
	const target = model.states.find((state) => state.key === input.status);
	if (!current || !target) throw new WorkObjectDomainError("INVALID_STATUS", `Unknown status: ${currentStatus} -> ${input.status}`);
	if (current.key !== target.key && !model.transitions.some((transition) => transition.from === current.key && transition.to === target.key)) {
		throw new WorkObjectDomainError("INVALID_TRANSITION", `Transition not allowed: ${current.key} -> ${target.key}`);
	}
	return { status: target.key, statusCategory: target.category };
}

export function validateWorkObjectDates(startAt: string | null | undefined, dueAt: string | null | undefined): void {
	if (!startAt || !dueAt) return;
	if (new Date(startAt).getTime() > new Date(dueAt).getTime()) {
		throw new WorkObjectDomainError("INVALID_DATES", "startAt cannot be after dueAt");
	}
}

export function validateProgress(progress: number | null | undefined): void {
	if (progress === undefined || progress === null) return;
	if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
		throw new WorkObjectDomainError("INVALID_PROGRESS", "progress must be an integer between 0 and 100");
	}
}

export function validateMoney(amount: string | null | undefined, currency: string | null | undefined): void {
	if (amount === undefined || amount === null) {
		if (currency) throw new WorkObjectDomainError("INVALID_MONEY", "moneyCurrency requires moneyAmount");
		return;
	}
	if (!/^\d+(\.\d{1,4})?$/.test(amount) || !currency || !/^[A-Z]{3}$/.test(currency)) {
		throw new WorkObjectDomainError("INVALID_MONEY", "moneyAmount and moneyCurrency are invalid");
	}
}

export function validateParent(id: string, parentObjectId: string | null | undefined): void {
	if (parentObjectId && id === parentObjectId) throw new WorkObjectDomainError("INVALID_PARENT", "A work object cannot be its own parent");
}

export function prepareWorkObjectCreate(input: WorkObjectCreateInput, typeDef: ObjectTypeDefContract): WorkObjectCreateInput & { status: string } {
	validateStatusModel(typeDef.statusModel);
	const status = input.status ?? typeDef.statusModel.initial;
	const state = typeDef.statusModel.states.find((candidate) => candidate.key === status);
	if (!state) throw new WorkObjectDomainError("INVALID_STATUS", `Unknown initial status: ${status}`);
	validateCustomFields(typeDef.schema, input.customFields);
	validateWorkObjectDates(input.startAt, input.dueAt);
	validateProgress(input.progress);
	validateMoney(input.moneyAmount, input.moneyCurrency);
	return { ...input, status };
}

export function validateWorkObjectUpdate(input: WorkObjectUpdateInput, typeDef: ObjectTypeDefContract, currentStatus: string): void {
	if (input.customFields) validateCustomFields(typeDef.schema, input.customFields);
	validateWorkObjectDates(input.startAt, input.dueAt);
	validateProgress(input.progress);
	validateMoney(input.moneyAmount, input.moneyCurrency);
	if (input.status) transitionStatus(typeDef.statusModel, currentStatus, { status: input.status });
}

export function generateHumanId(id: string, prefix: string): string {
	const normalizedPrefix = prefix.trim().toUpperCase();
	if (!/^[A-Z0-9]+$/.test(normalizedPrefix)) throw new WorkObjectDomainError("INVALID_STATUS", "Invalid object id prefix");
	const suffix = id.replace(/[^A-Za-z0-9]/g, "").slice(-8).toUpperCase();
	if (suffix.length < 6) throw new WorkObjectDomainError("INVALID_STATUS", "Object id is too short for a human id");
	return `${normalizedPrefix}-${suffix}`;
}
