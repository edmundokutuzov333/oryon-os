DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'channel_members'
      AND column_name = 'organization_id'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM channel_members
      WHERE organization_id IS NOT NULL
        AND organization_id <> org_id
    ) THEN
      RAISE EXCEPTION 'channel_members.organization_id conflicts with canonical org_id';
    END IF;

    ALTER TABLE "channel_members" DROP COLUMN "organization_id";
  END IF;
END $$;
