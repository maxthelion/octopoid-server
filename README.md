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
└── 0004_add_task_type.sql
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

### Tasks

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/tasks` | List tasks (filter by `?queue=`) |
| `POST` | `/api/v1/tasks` | Create a task |
| `GET` | `/api/v1/tasks/:id` | Get task by ID |
| `PATCH` | `/api/v1/tasks/:id` | Update task fields |
| `DELETE` | `/api/v1/tasks/:id` | Delete a task |
| `POST` | `/api/v1/tasks/claim` | Claim next available task |
| `POST` | `/api/v1/tasks/:id/submit` | Submit task for review |
| `POST` | `/api/v1/tasks/:id/accept` | Accept a submitted task |
| `POST` | `/api/v1/tasks/:id/reject` | Reject with feedback |

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
