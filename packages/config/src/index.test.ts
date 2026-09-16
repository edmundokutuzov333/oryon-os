import { describe, expect, it } from "vitest";
import { ORYON_CONFIG_VERSION } from "./index";

describe("config bootstrap", () => {
  it("exports the config version", () => expect(ORYON_CONFIG_VERSION).toBe("0.1.0"));
});
