import { describe, expect, it } from "vitest";
import { ORYON_AI_VERSION } from "./index.js";

describe("ai bootstrap", () => {
	it("exports the ai version", () => expect(ORYON_AI_VERSION).toBe("0.1.0"));
});
