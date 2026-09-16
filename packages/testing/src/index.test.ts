import { describe, expect, it } from "vitest";
import { ORYON_TESTING_VERSION } from "./index";

describe("testing bootstrap", () => {
  it("exports the testing version", () => expect(ORYON_TESTING_VERSION).toBe("0.1.0"));
});
