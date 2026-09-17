CREATE TYPE "WebhookDeliveryState" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

CREATE TABLE "webhook_deliveries" (
  "id" TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "webhook_id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "status" "WebhookDeliveryState" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "response_status" INTEGER,
  "last_error" TEXT,
  "last_attempt_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "webhook_deliveries_webhook_id_event_id_key" ON "webhook_deliveries"("webhook_id", "event_id");
CREATE INDEX "webhook_deliveries_org_id_status_created_at_idx" ON "webhook_deliveries"("org_id", "status", "created_at");
CREATE INDEX "webhook_deliveries_org_id_event_id_idx" ON "webhook_deliveries"("org_id", "event_id");

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "domain_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;
CREATE POLICY "oryon_tenant_isolation" ON "webhook_deliveries"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));

CREATE OR REPLACE FUNCTION public.oryon_worker_organization_ids()
RETURNS TABLE(id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id::text
  FROM organizations AS o
  WHERE o.deleted_at IS NULL
  ORDER BY o.id;
$$;
REVOKE ALL ON FUNCTION public.oryon_worker_organization_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oryon_worker_organization_ids() TO current_user;
