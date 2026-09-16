-- RLS is a real tenant boundary. The application context is set with
-- app.org_id and every tenant-scoped table must enforce it, including for
-- table owners, so FORCE ROW LEVEL SECURITY is deliberate.

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oryon_tenant_isolation" ON "organizations";
CREATE POLICY "oryon_tenant_isolation" ON "organizations"
  USING (id = current_setting('app.org_id', true))
  WITH CHECK (id = current_setting('app.org_id', true));

DO $$
DECLARE
  table_row record;
BEGIN
  FOR table_row IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'org_id'
    GROUP BY table_schema, table_name
    ORDER BY table_name
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', table_row.table_schema, table_row.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', table_row.table_schema, table_row.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', 'oryon_tenant_isolation', table_row.table_schema, table_row.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON %I.%I USING (org_id = current_setting(''app.org_id'', true)) WITH CHECK (org_id = current_setting(''app.org_id'', true))',
      'oryon_tenant_isolation', table_row.table_schema, table_row.table_name
    );
  END LOOP;
END $$;
