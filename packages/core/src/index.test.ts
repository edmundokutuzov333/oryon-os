import { describe, expect, it } from "vitest";
import { ORYON_CORE_VERSION } from "./index";

describe("core bootstrap", () => {
  it("exports the core version", () => expect(ORYON_CORE_VERSION).toBe("0.1.0"));
});
