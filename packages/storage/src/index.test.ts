import { describe, expect, it } from "vitest";
import { storageKeyFor } from "./index.js";

describe("storageKeyFor", () => {
	it("creates tenant and user scoped keys", () => {
		expect(
			storageKeyFor("org-1", "user-1", "file-1", "Relatório final.pdf"),
		).toBe("org/org-1/files/user-1/file-1/Relat-rio-final.pdf");
	});

	it("normalizes unsafe names", () => {
		expect(storageKeyFor("org", "user", "file", "a/b?.png")).toBe(
			"org/org/files/user/file/a-b-.png",
		);
	});
});
