-- ChannelMember already carries the canonical org_id tenant key.
-- Remove the redundant nullable organizationId relation and ensure org_id
-- is the authoritative organization foreign key.
ALTER TABLE "channel_members"
  DROP CONSTRAINT IF EXISTS "channel_members_organizationId_fkey";

ALTER TABLE "channel_members"
  DROP COLUMN IF EXISTS "organizationId";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'channel_members_org_id_fkey'
  ) THEN
    ALTER TABLE "channel_members"
      ADD CONSTRAINT "channel_members_org_id_fkey"
      FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
