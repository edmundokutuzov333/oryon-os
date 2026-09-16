import { describe, expect, it } from "vitest";
import { ORYON_UI_VERSION } from "./index";

describe("ui bootstrap", () => {
  it("exports the ui version", () => expect(ORYON_UI_VERSION).toBe("0.1.0"));
});
