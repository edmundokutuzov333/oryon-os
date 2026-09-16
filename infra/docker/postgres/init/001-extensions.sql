-- Prisma's initial migration owns the extensions required by the Oryon schema.
-- Keep this bootstrap script limited to extensions that are not represented there.
CREATE EXTENSION IF NOT EXISTS pg_partman;
