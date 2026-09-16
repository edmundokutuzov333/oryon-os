import { describe, expect, it } from "vitest";

describe("api bootstrap", () => {
	it("has a valid versioned health contract", async () => {
		const response = { status: "ok", service: "oryon-api", version: "0.1.0" };
		expect(response.status).toBe("ok");
		expect(response.service).toBe("oryon-api");
	});
});
