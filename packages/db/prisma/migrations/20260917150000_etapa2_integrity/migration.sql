-- ETAPA 2: canonical workspace membership, graph uniqueness and durable dispatch state.

CREATE TABLE IF NOT EXISTS "workspace_members" (
  "id" text NOT NULL,
  "org_id" text NOT NULL,
  "workspace_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" text NOT NULL DEFAULT 'MEMBER',
  "joined_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workspace_members_org_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_members_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workspace_members_user_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspace_user_key"
  ON "workspace_members"("workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "workspace_members_org_user_idx"
  ON "workspace_members"("org_id", "user_id");
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "workspace_members_tenant_isolation" ON "workspace_members";
CREATE POLICY "workspace_members_tenant_isolation"
  ON "workspace_members"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));

INSERT INTO "workspace_members" ("id", "org_id", "workspace_id", "user_id")
SELECT 'wm_' || w."id" || '_' || u."id", w."org_id", w."id", u."id"
FROM "workspaces" w
JOIN "users" u ON u."org_id" = w."org_id" AND u."deleted_at" IS NULL
WHERE w."deleted_at" IS NULL
ON CONFLICT ("workspace_id", "user_id") DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "edges_active_unique"
  ON "edges"("org_id", "from_type", "from_id", "to_type", "to_id", "relation")
  WHERE "deleted_at" IS NULL;

ALTER TABLE "domain_events"
  ADD COLUMN IF NOT EXISTS "dispatch_status" text NOT NULL DEFAULT 'PENDING';
ALTER TABLE "domain_events"
  ADD COLUMN IF NOT EXISTS "dispatch_attempts" integer NOT NULL DEFAULT 0;
ALTER TABLE "domain_events"
  ADD COLUMN IF NOT EXISTS "dispatch_locked_at" timestamp(3);
ALTER TABLE "domain_events"
  ADD COLUMN IF NOT EXISTS "dispatch_last_error" text;
ALTER TABLE "domain_events"
  ADD COLUMN IF NOT EXISTS "dispatched_at" timestamp(3);
CREATE INDEX IF NOT EXISTS "domain_events_dispatch_idx"
  ON "domain_events"("org_id", "dispatch_status", "created_at");

CREATE TABLE IF NOT EXISTS "outbox_consumer_deliveries" (
  "id" text NOT NULL,
  "org_id" text NOT NULL,
  "event_id" text NOT NULL,
  "consumer_key" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_consumer_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_consumer_deliveries_org_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "outbox_consumer_deliveries_event_fk" FOREIGN KEY ("event_id") REFERENCES "domain_events"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "outbox_consumer_event_key"
  ON "outbox_consumer_deliveries"("org_id", "event_id", "consumer_key");
CREATE INDEX IF NOT EXISTS "outbox_consumer_deliveries_org_consumer_idx"
  ON "outbox_consumer_deliveries"("org_id", "consumer_key", "created_at");
ALTER TABLE "outbox_consumer_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_consumer_deliveries" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "outbox_consumer_deliveries_tenant_isolation" ON "outbox_consumer_deliveries";
CREATE POLICY "outbox_consumer_deliveries_tenant_isolation"
  ON "outbox_consumer_deliveries"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));

CREATE TABLE IF NOT EXISTS "agent_run_idempotency" (
  "org_id" text NOT NULL,
  "agent_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "run_id" text NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_run_idempotency_pkey" PRIMARY KEY ("org_id", "agent_id", "idempotency_key"),
  CONSTRAINT "agent_run_idempotency_org_fk" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "agent_run_idempotency_run_fk" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "agent_run_idempotency" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "agent_run_idempotency" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_run_idempotency_tenant_isolation" ON "agent_run_idempotency";
CREATE POLICY "agent_run_idempotency_tenant_isolation"
  ON "agent_run_idempotency"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));
