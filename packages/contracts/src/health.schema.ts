import { z } from "zod";

export const HealthResponseSchema = z.object({
	status: z.literal("ok"),
	service: z.string().min(1),
	version: z.string().min(1),
	timestamp: z.iso.datetime({ offset: true }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
