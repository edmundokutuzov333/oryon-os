import { describe, expect, it } from "vitest";
import { ORYON_SEARCH_VERSION, fuseHybrid } from "./index.js";

describe("hybrid search", () => {
	it("exports the phase version", () => expect(ORYON_SEARCH_VERSION).toBe("1.0.0"));
	it("fuses lexical and semantic ranks without duplicating a document", () => {
		const result = fuseHybrid(
			[
				{ id: "page:1", type: "page", title: "A", snippet: "A", textRank: 1 },
				{ id: "work_object:2", type: "work_object", title: "B", snippet: "B", textRank: 2 },
			],
			[
				{ id: "work_object:2", type: "work_object", semanticScore: 0.9 },
				{ id: "page:3", type: "page", semanticScore: 0.8 },
			],
			10,
		);
		const joined = result.find((item) => item.id === "work_object:2");
		expect(result).toHaveLength(3);
		expect(joined?.matchedBy).toEqual(["lexical", "semantic"]);
	});
});
