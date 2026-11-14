# SQLite to Postgres Migration (Local, Native App)

Use this when your dataset outgrows SQLite concurrency/performance.

## 1) Start Postgres (Docker DB-only)

```bash
docker compose up -d postgres
```

## 2) Point app to Postgres

Set `.env`:

```bash
DATABASE_URL="postgresql://endpoint_extractor:endpoint_extractor@127.0.0.1:5432/endpoint_extractor?schema=public"
```

## 3) Apply Postgres Prisma schema

```bash
npm run prisma:generate:postgres
npm run prisma:dbpush:postgres
```

## 4) Optional data backfill strategy

For larger historical datasets, use a one-off migration script that:

1. Reads runs/endpoints/domains from old SQLite DB (readonly).
2. Inserts records into Postgres in batches (e.g. 1k rows per transaction).
3. Preserves stable IDs and dedupe keys.
4. Verifies row counts per table after copy.

Keep the app stopped during final cutover to avoid split writes.
