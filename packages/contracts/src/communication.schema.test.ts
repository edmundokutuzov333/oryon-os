import { describe, expect, it } from "vitest";
import {
	ChannelCreateInputSchema,
	DirectChannelCreateInputSchema,
	MessageCreateInputSchema,
	MessageSchema,
	NotificationListQuerySchema,
} from "./communication.schema.js";

describe("communication contracts", () => {
	it("accepts a channel definition", () => {
		expect(
			ChannelCreateInputSchema.parse({
				name: "produto",
				kind: "TEXT",
				visibility: "ORG",
			}).name,
		).toBe("produto");
	});
	it("requires at least one direct recipient", () => {
		expect(() =>
			DirectChannelCreateInputSchema.parse({ userIds: [] }),
		).toThrow();
	});
	it("normalizes a message with mentions and a thread parent", () => {
		const value = MessageCreateInputSchema.parse({
			bodyText: "@Ana revisar proposta",
			parentId: "msg_1",
			mentions: ["usr_2"],
		});
		expect(value.kind).toBe("TEXT");
		expect(value.parentId).toBe("msg_1");
	});
	it("supports unread notification queries", () => {
		expect(
			NotificationListQuerySchema.parse({ unreadOnly: true, limit: 10 }),
		).toEqual({ unreadOnly: true, limit: 10 });
	});
	it("rejects malformed message responses", () => {
		expect(() => MessageSchema.parse({ id: "msg_1" })).toThrow();
	});
});
