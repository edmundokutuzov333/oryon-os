import { describe, expect, it } from "vitest";
import { ORYON_SEARCH_VERSION } from "./index.js";

describe("search bootstrap", () => {
	it("exports the search version", () =>
		expect(ORYON_SEARCH_VERSION).toBe("0.1.0"));
});
