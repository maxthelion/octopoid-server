# Octopoid Server

API server for [Octopoid](https://github.com/maxthelion/octopoid) — a distributed AI orchestrator for software development. Built on Cloudflare Workers + D1.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/maxthelion/octopoid-server)

## What It Does

The server provides a REST API for coordinating multiple AI orchestrators across machines:

- **Task queue** with priorities, lease-based claiming, and state machine transitions
- **Orchestrator registration** with heartbeat monitoring
- **Drafts** for ideas/proposals that can become tasks
- **Projects** for grouping related tasks
- **Cron-based lease expiration** to reclaim abandoned tasks
- **Scope-based multi-tenancy** to isolate entities per project/session

## Architecture

```
┌─────────────────────────────────────────────┐
│        Cloudflare Workers Server            │
│  ┌────────────────────────────────────────┐ │
│  │  REST API (Hono framework)             │ │
│  │  - Tasks, Projects, Drafts             │ │
│  │  - Orchestrator registration           │ │
│  │  - State machine + lease management    │ │
│  └────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────┐ │
│  │  D1 Database (SQLite at the edge)      │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
             ▲              ▲
             │              │
    ┌────────┴───────┐   ┌─┴──────────────┐
    │ Orchestrator 1 │   │ Orchestrator 2  │
    │ (Laptop)       │   │ (Cloud VM)      │
    └────────────────┘   └─────────────────┘
```

## Local Development

```bash
# Clone the repo
git clone https://github.com/maxthelion/octopoid-server.git
cd octopoid-server

# Install dependencies
npm install

# Start local dev server (port 8787)
npx wrangler dev

# Health check
curl http://localhost:8787/api/health
```

The local dev server uses an in-memory D1 database — no setup needed.

## Remote Deployment

### 1. Create D1 Database

```bash
npx wrangler d1 create octopoid-db
```

This outputs a `database_id` — copy it.

### 2. Configure wrangler.toml

Replace the placeholder `database_id` with your actual ID:

```toml
[[d1_databases]]
binding = "DB"
database_name = "octopoid-db"
database_id = "your-actual-database-id-here"
```

### 3. Apply Migrations

```bash
# Apply to remote database
npx wrangler d1 migrations apply octopoid-db --remote
```

### 4. Deploy

```bash
npx wrangler deploy
```

Your server is now live at `https://octopoid-server.<your-subdomain>.workers.dev`.

### 5. Set Secrets (Optional)

```bash
# Admin API key (for protected endpoints)
npx wrangler secret put API_SECRET_KEY
```

## Database Migrations

Migrations live in `migrations/` and are numbered sequentially:

```
migrations/
├── 0001_initial.sql
├── 0002_add_missing_fields.sql
├── 0003_add_title_field.sql
├── 0004_add_task_type.sql
├── ...
└── 0009_add_scope.sql
```

### Apply migrations

```bash
# Local
npx wrangler d1 migrations apply octopoid-db

# Remote
npx wrangler d1 migrations apply octopoid-db --remote
```

### Create a new migration

```bash
npx wrangler d1 migrations create octopoid-db <description>
```

## API Endpoints

### Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check with DB status |
| `GET` | `/` | Server info + endpoint list |

### Orchestrators

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/orchestrators/register` | Register or update an orchestrator |
| `POST` | `/api/v1/orchestrators/:id/heartbeat` | Send heartbeat |
| `GET` | `/api/v1/orchestrators` | List all orchestrators |
| `GET` | `/api/v1/orchestrators/:id` | Get orchestrator by ID |
| `POST` | `/api/v1/orchestrators/scopes/:scope/rotate-key` | Rotate API key for a scope |

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/tasks` | List tasks (filter by `?queue=`, `?scope=`) |
| `POST` | `/api/v1/tasks` | Create a task |
| `GET` | `/api/v1/tasks/:id` | Get task by ID |
| `PATCH` | `/api/v1/tasks/:id` | Update task fields |
| `DELETE` | `/api/v1/tasks/:id` | Delete a task |
| `POST` | `/api/v1/tasks/claim` | Claim next available task |
| `POST` | `/api/v1/tasks/:id/submit` | Submit task for review |
| `POST` | `/api/v1/tasks/:id/accept` | Accept a submitted task |
| `POST` | `/api/v1/tasks/:id/reject` | Reject with feedback |
| `POST` | `/api/v1/tasks/:id/requeue` | Requeue a claimed/provisional task |

### Drafts

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/drafts` | List drafts |
| `POST` | `/api/v1/drafts` | Create a draft |
| `GET` | `/api/v1/drafts/:id` | Get draft by ID |
| `PATCH` | `/api/v1/drafts/:id` | Update a draft |
| `DELETE` | `/api/v1/drafts/:id` | Delete a draft |

### Projects

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/projects` | List projects |
| `POST` | `/api/v1/projects` | Create a project |
| `GET` | `/api/v1/projects/:id` | Get project by ID |
| `GET` | `/api/v1/projects/:id/tasks` | Get project tasks |
| `PATCH` | `/api/v1/projects/:id` | Update a project |
| `DELETE` | `/api/v1/projects/:id` | Delete a project |

## Multi-tenancy (Scope)

All entities (tasks, projects, drafts) support an optional `scope` field for isolating data between different projects or sessions sharing the same server.

- Set `scope` in the request body when creating an entity
- Filter by `?scope=<value>` on any list or get endpoint
- Claim requests accept `scope` in the body to only claim tasks within that scope
- Omitting `scope` makes the entity global (backwards compatible)
- Scope is immutable — set once at creation, never changed

```bash
# Create a scoped task
curl -X POST /api/v1/tasks -d '{"id": "t-1", "file_path": "...", "branch": "main", "scope": "my-project"}'

# List only tasks in that scope
curl /api/v1/tasks?scope=my-project

# Claim within a scope
curl -X POST /api/v1/tasks/claim -d '{"orchestrator_id": "...", "agent_name": "...", "scope": "my-project"}'
```

## Authentication

Scopes can be secured with API keys. Keys are issued automatically on first orchestrator registration for a scope.

### How it works

1. **First registration** for a scope returns an `api_key` (prefixed with `oct_`). Save it — it's only shown once.
2. **Subsequent requests** to that scope can include the key in the `Authorization` header.
3. **Unauthenticated access** continues to work — auth is currently opt-in. When a key is provided, the server validates it and checks scope matches, but unauthenticated requests are not blocked.

### Adopting API keys (for existing deployments)

If you're already running orchestrators, here's what happens after you deploy this update:

- **Nothing changes immediately.** Existing scopes have no keys, and all requests continue to work without auth.
- **Next time an orchestrator registers**, the response will include a new `api_key` field. Save this key.
- **Auth is optional for now.** You can start passing the key in requests whenever you're ready. There's no deadline — unauthenticated requests still work.
- **If you pass a key, it must be valid.** Invalid keys return 401, and a key for the wrong scope returns 403. But omitting the key entirely is fine.
- **A future update will enforce auth** for scopes that have keys. You'll have time to update your clients before that happens.

### Migration checklist

1. Deploy the server update (applies the `api_keys` migration)
2. Re-register your orchestrator — save the `api_key` from the response
3. Update your client config to pass `Authorization: Bearer <key>` on requests
4. Verify everything works with auth headers
5. (Future) Auth enforcement will be enabled in a later release

```bash
# Register orchestrator — first time for this scope returns an API key
curl -X POST /api/v1/orchestrators/register \
  -H 'Content-Type: application/json' \
  -d '{"cluster": "prod", "machine_id": "mac-1", "repo_url": "...", "scope": "my-project"}'
# Response: { "orchestrator_id": "prod-mac-1", "api_key": "oct_a1b2c3...", ... }

# Use the key for all subsequent requests
curl /api/v1/tasks?scope=my-project \
  -H 'Authorization: Bearer oct_a1b2c3...'

# Rotate key (requires current key)
curl -X POST /api/v1/orchestrators/scopes/my-project/rotate-key \
  -H 'Authorization: Bearer oct_a1b2c3...'
# Response: { "api_key": "oct_d4e5f6...", "scope": "my-project" }
```

### Key details

- Keys are stored as SHA-256 hashes — the raw key is never persisted
- Keys use the `oct_` prefix for easy identification by secret scanners
- One key per scope (rotating replaces the old key)
- If you provide a key, it must be valid — but omitting the key is allowed (for now)

## Environment Variables / Secrets

| Variable | Required | Description |
|----------|----------|-------------|
| `DB` | Yes | D1 database binding (configured in `wrangler.toml`) |
| `API_SECRET_KEY` | No | Secret key for admin endpoints |
| `ANTHROPIC_API_KEY` | No | For future server-side agent features |

## Testing

Unit tests use Vitest:

```bash
# Run all tests
npm test

# Run specific test files
npx vitest run tests/state-machine.test.ts
npx vitest run tests/routes-tasks.test.ts
```

For integration tests, see the [main Octopoid repo](https://github.com/maxthelion/octopoid/tree/main/tests/integration).

## Cost

Cloudflare Workers free tier includes:

- **100,000 requests/day** — more than enough for most orchestration workloads
- **D1 database** — 5 million rows read, 100K rows written per day
- **Cron triggers** — included

For most users, the server runs entirely within the free tier.

## License

MIT
