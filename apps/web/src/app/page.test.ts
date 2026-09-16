import { describe, expect, it } from "vitest";

describe("web bootstrap", () => {
	it("has the OryonOS app identity", () => {
		expect("OryonOS V1").toContain("OryonOS");
	});
});
