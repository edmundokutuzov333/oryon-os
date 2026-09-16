-- Tenant isolation for every table that carries org_id.
DO $$
DECLARE
	row_record record;
BEGIN
	FOR row_record IN
		SELECT DISTINCT c.table_schema, c.table_name
		FROM information_schema.columns c
		WHERE c.table_schema = 'public'
			AND c.column_name = 'org_id'
			AND c.table_name <> '_prisma_migrations'
		ORDER BY c.table_name
	LOOP
		EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', row_record.table_schema, row_record.table_name);
		EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', row_record.table_schema, row_record.table_name);
		EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I.%I', row_record.table_schema, row_record.table_name);
		EXECUTE format(
			'CREATE POLICY tenant_isolation ON %I.%I USING (org_id = current_setting(''app.org_id'', true)) WITH CHECK (org_id = current_setting(''app.org_id'', true))',
			row_record.table_schema,
			row_record.table_name
		);
	END LOOP;
END $$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public.organizations;
CREATE POLICY tenant_isolation ON public.organizations
	USING (id = current_setting('app.org_id', true))
	WITH CHECK (id = current_setting('app.org_id', true));
