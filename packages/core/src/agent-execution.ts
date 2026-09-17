import type {
	CheckpointPolicy,
	WorkflowCondition,
} from "@oryon/contracts/agents-automation";

export function requiresCheckpoint(
	policy: CheckpointPolicy,
	sensitive: boolean,
	explicit = false,
): boolean {
	if (explicit) return true;
	if (policy === "ALWAYS") return true;
	return policy === "SENSITIVE_ONLY" && sensitive;
}

export function assertBudget(
	capCents: bigint | null,
	spentCents: bigint,
	nextCostCents: bigint,
): void {
	if (capCents !== null && spentCents + nextCostCents > capCents)
		throw new Error("AI_BUDGET_EXCEEDED");
}

function readPath(input: unknown, path: string): unknown {
	let current: unknown = input;
	for (const part of path.split(".")) {
		if (current === null || typeof current !== "object" || !(part in current))
			return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

export function evaluateWorkflowCondition(
	condition: WorkflowCondition,
	input: unknown,
): boolean {
	const left = readPath(input, condition.path);
	switch (condition.operator) {
		case "exists":
			return left !== undefined && left !== null;
		case "eq":
			return left === condition.value;
		case "neq":
			return left !== condition.value;
		case "contains":
			return typeof left === "string"
				? left.includes(String(condition.value ?? ""))
				: Array.isArray(left)
					? left.some((item) => item === condition.value)
					: false;
		case "gt":
			return (
				typeof left === "number" &&
				typeof condition.value === "number" &&
				left > condition.value
			);
		case "gte":
			return (
				typeof left === "number" &&
				typeof condition.value === "number" &&
				left >= condition.value
			);
		case "lt":
			return (
				typeof left === "number" &&
				typeof condition.value === "number" &&
				left < condition.value
			);
		case "lte":
			return (
				typeof left === "number" &&
				typeof condition.value === "number" &&
				left <= condition.value
			);
	}
}
