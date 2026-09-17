-- Semantic retrieval must remain fast as the tenant corpus grows.
-- Partial HNSW indexes avoid indexing NULL embeddings while keeping cosine
-- distance compatible with the retrieval operator used by SearchRepository.

CREATE INDEX IF NOT EXISTS "work_objects_embedding_hnsw_idx"
  ON "work_objects" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "pages_embedding_hnsw_idx"
  ON "pages" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "file_assets_embedding_hnsw_idx"
  ON "file_assets" USING hnsw ("embedding" vector_cosine_ops)
  WHERE "embedding" IS NOT NULL;
