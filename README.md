# SQL Copilot

An AI-powered data copilot: connect your own database, ask questions in natural
language, and get safe, validated, read-only SQL — generated, executed, and
self-healed automatically. Multi-tenant SaaS architecture from day one.

## Architecture

```
React (Vercel)
      │  cookies (HttpOnly session)
      ▼
Cloudflare Worker API  ── Hono + Drizzle
      │
      ├── Supabase Postgres (app data + pgvector schema embeddings)
      ├── Ollama on Oracle Cloud VM (Qwen2.5 7B + BGE-small embeddings)
      ├── SQL validator (AST allowlist; optional SQLGlot microservice)
      └── Tenant databases (users' own PostgreSQL, read-only execution)
```

Ask pipeline: question → embed → pgvector retrieval of relevant tables only →
prompt → Ollama → AST validation (reject anything but a single SELECT, inject
row LIMIT) → execute in a `READ ONLY` transaction with `statement_timeout` →
self-heal on error (feed the DB error back to the model, up to 3 retries) →
results.

## Repository layout

| Path | Purpose |
| --- | --- |
| `apps/web` | React + Vite + Tailwind + TanStack Query frontend |
| `services/api` | Cloudflare Worker: auth, connections, ask/execute, history, benchmark |
| `services/ingestion` | Schema extraction/embedding library + standalone CLI reindexer |
| `services/sqlglot` | Optional Python FastAPI second-opinion validator (SQLGlot) |
| `packages/shared` | Types, zod schemas, Result, logger, AppError |
| `packages/ai` | `LlmProvider`/`EmbeddingProvider` contracts + Ollama implementation |
| `packages/prompts` | SQL generation/repair prompts + completion parsing |
| `packages/database` | Drizzle schema, migrations, app-DB and tenant-DB clients |
| `packages/vector` | pgvector upsert + cosine-similarity retrieval |

## API

| Endpoint | Description |
| --- | --- |
| `POST /auth/signup` `/auth/login` `/auth/logout`, `GET /auth/me` | Email/password auth, HttpOnly session cookie |
| `POST /connect-db` | Test, encrypt (AES-256-GCM), and save tenant credentials |
| `GET /connections`, `DELETE /connections/:id` | Manage connections |
| `POST /ingest-schema`, `POST /reindex` | Extract schema, embed, store in pgvector (aliases: ingestion fully replaces the index) |
| `GET /schema?connectionId=` | Indexed tables and their documents |
| `POST /ask` | NL → SQL → validate → execute → self-heal |
| `POST /execute` | Run user-edited SQL through the same validator/executor |
| `GET /history`, `GET /history/:id` | Conversations and messages |
| `POST /benchmark` | Exact-match / execution / result accuracy over test cases |

## Safety model (defense in depth)

1. **AST allowlist** (`node-sql-parser`): exactly one statement, type must be
   SELECT; unparseable SQL is rejected (fails closed); `tableList` authority
   check rejects non-select table access (e.g. data-modifying CTEs).
2. **Keyword denylist** on raw SQL (INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/
   CREATE/GRANT/…) as a backstop.
3. **Row cap**: LIMIT injected/clamped in the AST, re-enforced in the executor.
4. **Runtime backstop**: execution inside a `READ ONLY` transaction with
   `statement_timeout` — Postgres itself refuses writes even if something
   slipped through.
5. **Optional SQLGlot service**: independent Python parser as a second opinion
   (SQLGlot cannot run inside a Worker; set `SQLGLOT_URL` to enable).
6. Credentials AES-256-GCM encrypted at rest; sessions stored as SHA-256
   hashes; recommend a **read-only DB role** for connected databases anyway.

## Local development

```bash
pnpm install

# 1. App database (Supabase): create a project, then run migrations
DATABASE_URL="postgres://..." pnpm db:migrate

# 2. Ollama (local or the Oracle VM)
ollama pull qwen2.5:7b
ollama pull bge-small-en-v1.5   # embeddings (384 dims)

# 3. API worker
cd services/api
cp .dev.vars.example .dev.vars   # fill in DATABASE_URL, ENCRYPTION_KEY (openssl rand -base64 32), OLLAMA_URL
pnpm dev                         # http://localhost:8787

# 4. Web app
cd apps/web
cp .env.example .env             # VITE_API_URL=http://localhost:8787
pnpm dev                         # http://localhost:5173
```

Checks: `pnpm typecheck` · `pnpm test` (validator/crypto/prompt unit tests).

## Deployment

- **Frontend (Vercel):** set the project root to `apps/web`; Vercel detects the
  pnpm workspace. Env: `VITE_API_URL=https://<worker>.workers.dev`.
- **API (Cloudflare Workers):** `cd services/api && wrangler deploy`, then
  `wrangler secret put DATABASE_URL / ENCRYPTION_KEY / OLLAMA_URL` and set
  `CORS_ORIGIN` to the Vercel URL in `wrangler.toml`.
- **Database (Supabase):** enable the `vector` extension (the migration does
  this), use the transaction pooler URL (port 6543) for the Worker.
- **LLM (Oracle Cloud Always Free VM):** run Ollama bound to a private/VPN
  address or behind a reverse proxy with auth; optionally run the SQLGlot
  service (`services/sqlglot`) on the same VM.

## Design decisions & deviations

- **SQLGlot** is Python and cannot run in a Cloudflare Worker. The validator is
  an interface (`SqlValidator`); the default implementation uses
  `node-sql-parser` in-Worker, and `SqlglotValidator` calls the optional
  microservice when `SQLGLOT_URL` is set. Both run via `CompositeValidator`.
- **`services/ingestion`** is a library + CLI rather than a separately deployed
  worker: the API imports it directly (one deploy for the MVP), and the CLI
  covers very large schemas that exceed Worker CPU limits.
- **Self-healing** counts validation failures and execution failures alike:
  1 initial attempt + up to 3 repairs (`QUERY_LIMITS.maxAttempts = 4`).
- **Multi-tenancy** is enforced at the query layer — every table carries
  `user_id`/`connection_id` and `getOwnedConnection` gates all tenant access.
- MySQL support: add a dialect entry in `packages/shared`, a driver in
  `packages/database/tenant.ts`, and an extractor variant — interfaces are
  already dialect-parameterized.
