# Plan: Add `scope` field for multi-tenant entity isolation

## Context

The octopoid-server is shared across multiple local projects and orchestrator instances. Currently, all entities (tasks, projects, drafts) are global — any client sees everything. This causes problems for:

1. **Multiple projects on one server** — orchestrators for different projects collide
2. **Multiple schedulers for the same project** — need shared visibility within a group
3. **Test isolation** — test sessions need their own view without polluting production data

The existing `orchestrator_id` on tasks serves a different purpose: it tracks which **specific orchestrator instance** holds a lease (set on claim, cleared on reject/lease expiry). This must remain separate from the scoping concept, since multiple orchestrator instances can share a scope.

## Design

Add a new `scope` TEXT field to **tasks**, **projects**, and **drafts**. This is the multi-tenancy key:

- Orchestrators reading from the same `config.yaml` share a scope and see each other's entities
- A tester sets scope to a random value for isolation
- The server filters all LIST/GET queries by `scope` when provided as a query parameter
- Set at creation time in the request body, never mutated
- Optional — omitting it means the entity is "global" (backwards compatible)
- `orchestrator_id` on tasks is **unchanged** — still used for lease tracking only

### Why `scope` and not reuse `orchestrator_id`?

`orchestrator_id` on tasks has lifecycle semantics: set on claim, cleared on reject/expiry. Overloading it for both "who owns this" and "who's leasing this" creates conflicts. A separate `scope` field is set once at creation and never changes, making queries predictable.

## Files to change

### 1. `migrations/0009_add_scope.sql` (new)

```sql
ALTER TABLE tasks ADD COLUMN scope TEXT;
CREATE INDEX idx_tasks_scope ON tasks(scope);

ALTER TABLE projects ADD COLUMN scope TEXT;
CREATE INDEX idx_projects_scope ON projects(scope);

ALTER TABLE drafts ADD COLUMN scope TEXT;
CREATE INDEX idx_drafts_scope ON drafts(scope);
```

### 2. `src/types/shared.ts`

Add `scope` to these interfaces:
- `Task` — add `scope?: string | null`
- `CreateTaskRequest` — add `scope?: string`
- `TaskFilters` — add `scope?: string`
- `Project` — add `scope?: string | null`
- `CreateProjectRequest` — add `scope?: string`
- `ProjectFilters` — add `scope?: string`
- `Draft` — add `scope?: string | null`
- `CreateDraftRequest` — add `scope?: string`
- `DraftFilters` — add `scope?: string`

### 3. `src/routes/tasks.ts`

- **GET `/`** (list): Parse `scope` query param, add `AND scope = ?` condition when present
- **GET `/:id`**: Parse optional `scope` query param, add to WHERE clause when present
- **POST `/`** (create): Include `body.scope || null` in INSERT columns/values
- **POST `/claim`**: Add `AND scope = ?` to the claim SELECT when the claim request includes a scope (add `scope?: string` to `ClaimTaskRequest`)

### 4. `src/routes/projects.ts`

- **GET `/`** (list): Parse `scope` query param, add `AND scope = ?` condition
- **GET `/:id`**: Parse optional `scope` query param, add to WHERE clause
- **GET `/:id/tasks`**: Parse optional `scope` query param, add to tasks sub-query
- **POST `/`** (create): Include `body.scope || null` in INSERT columns/values and project object

### 5. `src/routes/drafts.ts`

- **GET `/`** (list): Parse `scope` query param, add `AND scope = ?` condition
- **GET `/:id`**: Parse optional `scope` query param, add to WHERE clause
- **POST `/`** (create): Include `body.scope || null` in INSERT columns/values and draft object

### 6. No changes needed

- `src/state-machine.ts` — operates on task ID, unaffected
- `src/scheduled/lease-monitor.ts` — releases expired leases globally, correct behaviour
- `src/routes/orchestrators.ts` — orchestrators are the identity layer, not scoped

## Verification

1. Deploy and run migration `0009_add_scope.sql`
2. Create a task with `"scope": "test-123"` — confirm it's stored
3. List tasks with `?scope=test-123` — confirm only scoped tasks returned
4. List tasks without scope param — confirm all tasks returned (backwards compat)
5. Repeat for projects and drafts
6. Claim with scope — confirm only scoped tasks are claimable
