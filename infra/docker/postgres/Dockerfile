FROM pgvector/pgvector:0.8.6-pg17-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-17-partman \
  && rm -rf /var/lib/apt/lists/*
