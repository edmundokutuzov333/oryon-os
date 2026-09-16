import type { Prisma, PrismaClient } from "../generated/client.js";
import { getDomainTemplate, type DomainTemplateManifest } from "@oryon/contracts/domain-template-data";
import type { DomainTemplateSummary, DomainTemplateInstallResponse } from "@oryon/contracts/domain-templates";
import { appendDomainEvent } from "../outbox.js";
import { withOrgContext } from "../tenant.js";

interface InstalledTemplateState {
  status: "INSTALLED" | "INACTIVE";
  version: number;
  installedAt: string;
  typeDefIds: string[];
}

type InstalledTemplateMap = Record<string, InstalledTemplateState>;

function installedTemplates(settings: unknown): InstalledTemplateMap {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return {};
  const value = (settings as Record<string, unknown>).domainTemplates;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as InstalledTemplateMap;
}

function nextSettings(settings: unknown, templates: InstalledTemplateMap): Record<string, unknown> {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? { ...(settings as Record<string, unknown>) } : {};
  base.domainTemplates = templates;
  return base;
}

function inputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toSummary(template: DomainTemplateManifest, state?: InstalledTemplateState): DomainTemplateSummary {
  return {
    key: template.key,
    version: template.version,
    name: template.name,
    shortDescription: template.shortDescription,
    description: template.description,
    icon: template.icon,
    audience: template.audience,
    status: state?.status === "INACTIVE" ? "INACTIVE" : state ? "INSTALLED" : "AVAILABLE",
    installedAt: state?.installedAt ?? null,
    installedVersion: state?.version ?? null,
    objectTypeCount: template.objectTypes.length,
    journeyCount: template.journeys.length,
  };
}

export class DomainTemplateRepository {
  private readonly db: PrismaClient;

  constructor(db: PrismaClient) {
    this.db = db;
  }

  async list(orgId: string): Promise<DomainTemplateSummary[]> {
    return withOrgContext(this.db, orgId, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, select: { settings: true } });
      const states = installedTemplates(org?.settings);
      return ["crm", "support", "product_engineering"]
        .map((key) => getDomainTemplate(key))
        .filter((template): template is DomainTemplateManifest => template !== undefined)
        .map((template) => toSummary(template, states[template.key]));
    });
  }

  async find(_orgId: string, key: string): Promise<DomainTemplateManifest | undefined> {
    return getDomainTemplate(key);
  }

  async install(orgId: string, actorId: string, key: string): Promise<DomainTemplateInstallResponse> {
    const template = getDomainTemplate(key);
    if (!template) throw new Error("DOMAIN_TEMPLATE_NOT_FOUND");

    return withOrgContext(this.db, orgId, async (tx) => {
      const organization = await tx.organization.findFirst({ where: { id: orgId }, select: { settings: true } });
      if (!organization) throw new Error("ORG_NOT_FOUND");

      const states = installedTemplates(organization.settings);
      const current = states[template.key];
      const existing = await tx.objectTypeDef.findMany({ where: { orgId, key: { in: template.objectTypes.map((type) => type.key) } } });
      const existingByKey = new Map(existing.map((row) => [row.key, row]));
      if (!current) {
        const conflicting = existing.find((row) => !row.isSystem);
        if (conflicting) throw new Error("DOMAIN_TEMPLATE_TYPE_CONFLICT");
      }

      const typeDefIds: string[] = [];
      let createdCount = 0;
      let updatedCount = 0;

      for (const type of template.objectTypes) {
        const currentType = existingByKey.get(type.key);
        if (currentType) {
          if (!current?.typeDefIds.includes(currentType.id) && !currentType.isSystem) throw new Error("DOMAIN_TEMPLATE_TYPE_CONFLICT");
          await tx.objectTypeDef.update({
            where: { id: currentType.id },
            data: {
              name: type.name,
              pluralName: type.pluralName,
              icon: type.icon,
              isSystem: true,
              idPrefix: type.idPrefix,
              schema: inputJson(type.schema),
              statusModel: inputJson(type.statusModel),
              defaultViews: inputJson({ views: type.defaultViews }),
            },
          });
          typeDefIds.push(currentType.id);
          updatedCount += 1;
          await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "ObjectTypeDef", subjectId: currentType.id, name: "domain_template.type.updated", payload: { template: template.key, version: template.version, key: type.key } });
        } else {
          const row = await tx.objectTypeDef.create({
            data: {
              orgId,
              key: type.key,
              name: type.name,
              pluralName: type.pluralName,
              icon: type.icon,
              isSystem: true,
              idPrefix: type.idPrefix,
              schema: inputJson(type.schema),
              statusModel: inputJson(type.statusModel),
              defaultViews: inputJson({ views: type.defaultViews }),
            },
          });
          typeDefIds.push(row.id);
          createdCount += 1;
          await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "ObjectTypeDef", subjectId: row.id, name: "domain_template.type.created", payload: { template: template.key, version: template.version, key: type.key } });
        }
      }

      const next: InstalledTemplateState = {
        status: "INSTALLED",
        version: template.version,
        installedAt: current?.installedAt ?? new Date().toISOString(),
        typeDefIds,
      };
      states[template.key] = next;
      await tx.organization.update({ where: { id: orgId }, data: { settings: inputJson(nextSettings(organization.settings, states)) } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Organization", subjectId: orgId, name: "domain_template.installed", payload: { template: template.key, version: template.version, typeDefIds, relations: template.relations } });

      return { key: template.key, version: template.version, status: "INSTALLED", objectTypeIds: typeDefIds, createdCount, updatedCount, reactivated: current?.status === "INACTIVE" };
    });
  }

  async deactivate(orgId: string, actorId: string, key: string) {
    const template = getDomainTemplate(key);
    if (!template) throw new Error("DOMAIN_TEMPLATE_NOT_FOUND");
    return withOrgContext(this.db, orgId, async (tx) => {
      const organization = await tx.organization.findFirst({ where: { id: orgId }, select: { settings: true } });
      if (!organization) throw new Error("ORG_NOT_FOUND");
      const states = installedTemplates(organization.settings);
      const current = states[template.key];
      if (!current) return { key: template.key, status: "INACTIVE" as const, changed: false };
      if (current.status === "INACTIVE") return { key: template.key, status: "INACTIVE" as const, changed: false };
      states[template.key] = { ...current, status: "INACTIVE" };
      await tx.organization.update({ where: { id: orgId }, data: { settings: inputJson(nextSettings(organization.settings, states)) } });
      await appendDomainEvent(tx, { orgId, actorId, actorType: "MEMBER", subjectType: "Organization", subjectId: orgId, name: "domain_template.deactivated", payload: { template: template.key, version: current.version, typeDefIds: current.typeDefIds } });
      return { key: template.key, status: "INACTIVE" as const, changed: true };
    });
  }
}
