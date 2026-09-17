import { describe, expect, it } from "vitest";
import { DOMAIN_TEMPLATE_MANIFESTS } from "./domain-templates.js";
import { DomainTemplateManifestSchema } from "./domain-templates.schema.js";

const keys = new Set<string>();

for (const template of DOMAIN_TEMPLATE_MANIFESTS) {
	describe(`domain template ${template.key}`, () => {
		it("conforms to the public manifest contract", () => {
			expect(DomainTemplateManifestSchema.parse(template)).toEqual(template);
			expect(keys.has(template.key)).toBe(false);
			keys.add(template.key);
		});

		it("has unique work object type keys and valid relation endpoints", () => {
			const typeKeys = new Set(template.objectTypes.map((type) => type.key));
			expect(typeKeys.size).toBe(template.objectTypes.length);
			for (const relation of template.relations) {
				expect(typeKeys.has(relation.fromTypeKey)).toBe(true);
				expect(typeKeys.has(relation.toTypeKey)).toBe(true);
			}
		});
	});
}

it("ships the three Phase 14 domains", () => {
	expect(DOMAIN_TEMPLATE_MANIFESTS.map((template) => template.key)).toEqual([
		"crm",
		"support",
		"product_engineering",
	]);
});
