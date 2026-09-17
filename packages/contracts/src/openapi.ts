import * as z from "zod";

export type ContractSchema = z.ZodType;
export type OpenApiSchema = Record<string, unknown>;

export function toOpenApiSchema(schema: ContractSchema): OpenApiSchema {
	return z.toJSONSchema(schema, {
		target: "draft-2020-12",
		reused: "ref",
		unrepresentable: "any",
	}) as OpenApiSchema;
}
