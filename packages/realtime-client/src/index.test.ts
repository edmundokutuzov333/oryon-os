import { describe, expect, it } from "vitest";
import { ORYON_REALTIME_VERSION } from "./index.js";

describe("realtime client bootstrap", () => {
	it("exports the realtime version", () =>
		expect(ORYON_REALTIME_VERSION).toBe("0.1.0"));
});
