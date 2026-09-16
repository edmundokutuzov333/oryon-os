import { describe, expect, it } from "vitest";
import { GraphDomainError, assertNoProtectedCycle, cycleWouldExist, graphNodeKey, neighboursForDirection } from "./graph.js";

const a = { type: "work_object" as const, id: "a" };
const b = { type: "work_object" as const, id: "b" };
const c = { type: "work_object" as const, id: "c" };

function adjacency(entries: readonly [string, readonly { type: string; id: string }[]][]): ReadonlyMap<string, readonly { type: string; id: string }[]> {
	return new Map(entries);
}

describe("work graph domain", () => {
	it("detects a protected cycle", () => {
		const graph = adjacency([[graphNodeKey(a), [b]], [graphNodeKey(b), [c]], [graphNodeKey(c), []]]);
		expect(cycleWouldExist(c, a, "BLOCKS", graph)).toBe(true);
		expect(() => assertNoProtectedCycle(c, a, "BLOCKS", graph)).toThrowError(GraphDomainError);
	});

	it("does not impose cycle semantics on non protected relations", () => {
		const graph = adjacency([[graphNodeKey(a), [b]], [graphNodeKey(b), [a]]]);
		expect(cycleWouldExist(b, a, "RELATES_TO", graph)).toBe(false);
	});

	it("rejects self edges before cycle traversal", () => {
		const graph = adjacency([]);
		expect(() => assertNoProtectedCycle(a, a, "PARENT_OF", graph)).toThrow(/cannot point to itself/);
	});

	it("resolves out, in and both traversal directions deterministically", () => {
		expect(neighboursForDirection("out", "RELATES_TO", a, b)).toEqual([{ node: b, relation: "RELATES_TO", edgeDirection: "out" }]);
		expect(neighboursForDirection("in", "RELATES_TO", a, b)).toEqual([{ node: a, relation: "RELATES_TO", edgeDirection: "in" }]);
		expect(neighboursForDirection("both", "RELATES_TO", a, b)).toHaveLength(2);
	});
});
