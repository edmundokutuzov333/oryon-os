export const ORYON_CORE_VERSION = "0.1.0" as const;

export {
	can,
	evaluatePermissions,
	maskFields,
	type PermissionPolicyContext,
} from "./permissions.js";

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
