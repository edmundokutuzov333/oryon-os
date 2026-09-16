import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE } from "./index.js";

describe("i18n bootstrap", () => {
	it("defaults to pt-MZ", () => expect(DEFAULT_LOCALE).toBe("pt-MZ"));
});
