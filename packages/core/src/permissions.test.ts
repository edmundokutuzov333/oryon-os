import { describe, expect, it } from "vitest";
import { can, evaluatePermissions, maskFields, type PermissionPolicyContext } from "./permissions.js";
import type { PermissionResource } from "@oryon/contracts/permissions";

const resource: PermissionResource = {
	orgId: "org_1",
	type: "work_object",
	id: "obj_1",
	workspaceId: "ws_1",
	projectId: null,
	ownerId: null,
	teamId: "team_1",
	classification: "internal",
};

const subject = { id: "usr_1", type: "MEMBER" as const, email: "member@example.com", teamIds: ["team_1"], channelIds: ["chn_1"] };
const base: PermissionPolicyContext = { orgId: "org_1", subject, roles: [], grants: [], classification: null };
const now = new Date("2026-01-01T00:00:00.000Z");

describe("permission engine", () => {
	it("allows owner actions", () => {
		const decision = can({ ...base, subject }, { ...resource, ownerId: subject.id }, "update", now);
		expect(decision.allowed).toBe(true);
		expect(decision.reason).toBe("resource_owner");
	});

	it("resolves scoped RBAC", () => {
		const decision = can({ ...base, roles: [{ permissions: ["work_object:update"], scopeType: "TEAM", scopeId: "team_1", expiresAt: null }] }, resource, "update", now);
		expect(decision.allowed).toBe(true);
	});

	it("ignores expired bindings", () => {
		const decision = can({ ...base, roles: [{ permissions: ["work_object:update"], scopeType: "ORG", scopeId: "org_1", expiresAt: "2025-01-01T00:00:00.000Z" }] }, resource, "update", now);
		expect(decision.allowed).toBe(false);
	});

	it("enforces classification before exposure", () => {
		const context = { ...base, classification: { key: "restricted", rank: 90, blocksExternal: true, blocksAi: true, blocksDownload: true, watermark: true } };
		expect(can(context, resource, "use_external", now).allowed).toBe(false);
		expect(can(context, resource, "use_ai", now).allowed).toBe(false);
		expect(can(context, resource, "export", now).allowed).toBe(false);
	});

	it("supports explicit external grants and field masks", () => {
		const context = { ...base, grants: [{ resourceType: "work_object", resourceId: "obj_1", principalId: null, teamId: null, externalEmail: "member@example.com", level: "VIEW" as const, fieldMask: ["moneyAmount"], expiresAt: null, revokedAt: null }] };
		const result = evaluatePermissions(context, { resource, external: true, ai: false, fields: ["title", "moneyAmount"] }, now);
		expect(result.exposure.external.allowed).toBe(true);
		expect(result.exposure.fieldAccess.moneyAmount).toBe("masked");
		expect(maskFields({ title: "Visible", moneyAmount: "100" }, result.exposure.fieldAccess)).toEqual({ title: "Visible", moneyAmount: "••••••" });
	});

	it("uses channel membership inside can", () => {
		const channel: PermissionResource = { orgId: "org_1", type: "channel", id: "chn_1", workspaceId: null, projectId: null, ownerId: null, teamId: null, classification: null };
		expect(can(base, channel, "read", now).allowed).toBe(true);
		expect(can(base, channel, "comment", now).allowed).toBe(true);
		expect(can({ ...base, subject: { ...subject, channelIds: [] } }, channel, "read", now).allowed).toBe(false);
	});

	it("rejects cross-organization resources", () => {
		expect(can(base, { ...resource, orgId: "org_2" }, "read", now).allowed).toBe(false);
	});
});
