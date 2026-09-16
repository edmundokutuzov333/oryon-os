import { z } from "zod";
import { EdgeRelationSchema } from "./graph.schema.js";
import { ObjectFieldDefSchema, ObjectStatusModelSchema } from "./work-object.schema.js";

export const DomainKeySchema = z.enum(["crm", "support", "product_engineering"]);
export const DomainTemplateStatusSchema = z.enum(["AVAILABLE", "INSTALLED", "INACTIVE"]);

export const DomainTemplateTypeSchema = z.object({
  key: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(120),
  pluralName: z.string().min(1).max(120),
  icon: z.string().max(80).nullable(),
  idPrefix: z.string().min(1).max(20).regex(/^[A-Z0-9]+$/),
  schema: z.object({ fields: z.array(ObjectFieldDefSchema).default([]) }),
  statusModel: ObjectStatusModelSchema,
  defaultViews: z.array(z.object({ key: z.string().min(1), type: z.string().min(1), name: z.string().min(1) })).default([]),
});

export const DomainTemplateRelationSchema = z.object({
  fromTypeKey: z.string().min(1),
  toTypeKey: z.string().min(1),
  relation: EdgeRelationSchema,
  label: z.string().min(1).max(120),
});

export const DomainTemplateJourneySchema = z.object({
  key: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  description: z.string().min(1).max(500),
  entryTypeKey: z.string().min(1),
  outcomeTypeKey: z.string().min(1),
  steps: z.array(z.object({ key: z.string().min(1), label: z.string().min(1), typeKey: z.string().min(1) })).min(1),
});

export const DomainTemplateManifestSchema = z.object({
  key: DomainKeySchema,
  version: z.number().int().positive(),
  name: z.string().min(1).max(120),
  shortDescription: z.string().min(1).max(300),
  description: z.string().min(1).max(1000),
  icon: z.string().max(80),
  audience: z.string().min(1).max(160),
  objectTypes: z.array(DomainTemplateTypeSchema).min(1),
  relations: z.array(DomainTemplateRelationSchema).default([]),
  journeys: z.array(DomainTemplateJourneySchema).default([]),
});

export const DomainTemplateSummarySchema = z.object({
  key: DomainKeySchema,
  version: z.number().int().positive(),
  name: z.string(),
  shortDescription: z.string(),
  description: z.string(),
  icon: z.string(),
  audience: z.string(),
  status: DomainTemplateStatusSchema,
  installedAt: z.string().datetime({ offset: true }).nullable(),
  installedVersion: z.number().int().positive().nullable(),
  objectTypeCount: z.number().int().nonnegative(),
  journeyCount: z.number().int().nonnegative(),
});

export const DomainTemplateInstallResponseSchema = z.object({
  key: DomainKeySchema,
  version: z.number().int().positive(),
  status: z.literal("INSTALLED"),
  objectTypeIds: z.array(z.string().min(1)),
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  reactivated: z.boolean(),
});

export const DomainTemplateActionResponseSchema = z.object({
  key: DomainKeySchema,
  status: z.enum(["INSTALLED", "INACTIVE"]),
  changed: z.boolean(),
});

export type DomainTemplateManifest = z.infer<typeof DomainTemplateManifestSchema>;
export type DomainTemplateSummary = z.infer<typeof DomainTemplateSummarySchema>;
export type DomainTemplateInstallResponse = z.infer<typeof DomainTemplateInstallResponseSchema>;
