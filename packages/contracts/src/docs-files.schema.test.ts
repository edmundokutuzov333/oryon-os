import { describe, expect, it } from "vitest";
import {
	FileCompleteInputSchema,
	PageCreateInputSchema,
	PageUpdateInputSchema,
} from "./docs-files.schema.js";

describe("docs files contracts", () => {
	it("accepts a minimal page create payload", () => {
		expect(PageCreateInputSchema.parse({ title: "Roadmap" })).toMatchObject({
			title: "Roadmap",
		});
	});

	it("requires stable upload identity on completion", () => {
		expect(() =>
			FileCompleteInputSchema.parse({
				name: "a.pdf",
				mimeType: "application/pdf",
				sizeBytes: 10,
				checksumSha256: "0".repeat(64),
			}),
		).toThrow();
	});

	it("accepts Yjs-backed page updates", () => {
		const value = PageUpdateInputSchema.parse({
			contentYjsBase64: "AAEC",
			contentText: "hello",
		});
		expect(value.contentYjsBase64).toBe("AAEC");
	});
});
