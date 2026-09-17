export const ORYON_CORE_VERSION = "0.1.0" as const;

export {
	can,
	evaluatePermissions,
	maskFields,
	type PermissionPolicyContext,
} from "./permissions.js";

export {
	GraphDomainError,
	GRAPH_RELATIONS,
	PROTECTED_CYCLE_RELATIONS,
	assertNoProtectedCycle,
	cycleWouldExist,
	graphNodeKey,
	neighboursForDirection,
	relationAllowedForCycleCheck,
	validateGraphSelfEdge,
	type GraphAdjacency,
} from "./graph.js";

export {
	WorkObjectDomainError,
	generateHumanId,
	prepareWorkObjectCreate,
	transitionStatus,
	validateCustomFields,
	validateMoney,
	validateParent,
	validateProgress,
	validateStatusModel,
	validateWorkObjectDates,
	validateWorkObjectUpdate,
} from "./work-object.js";

export {
	assertBudget,
	requiresCheckpoint,
	evaluateWorkflowCondition,
} from "./agent-execution.js";
