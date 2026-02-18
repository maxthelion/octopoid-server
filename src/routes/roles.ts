/**
 * Roles API routes
 */

import { Hono } from 'hono'
import type { Env } from '../index'
import { query, queryOne, execute } from '../database'

export const rolesRoute = new Hono<{ Bindings: Env }>()

/**
 * Register roles (bulk upsert)
 * POST /api/v1/roles/register
 */
rolesRoute.post('/register', async (c) => {
  const db = c.env.DB
  const body = await c.req.json() as {
    orchestrator_id: string
    roles: Array<{ name: string; claims_from?: string; description?: string }>
  }

  if (!body.orchestrator_id || !body.roles || !Array.isArray(body.roles)) {
    return c.json(
      { error: 'Missing required fields: orchestrator_id, roles' },
      400
    )
  }

  // Validate orchestrator exists
  const orchestrator = await queryOne(
    db,
    'SELECT id FROM orchestrators WHERE id = ?',
    body.orchestrator_id
  )
  if (!orchestrator) {
    return c.json(
      { error: `Orchestrator '${body.orchestrator_id}' not found` },
      400
    )
  }

  // Upsert each role
  for (const role of body.roles) {
    if (!role.name) continue
    await execute(
      db,
      `INSERT OR REPLACE INTO roles (name, description, claims_from, orchestrator_id)
       VALUES (?, ?, ?, ?)`,
      role.name,
      role.description || null,
      role.claims_from || 'incoming',
      body.orchestrator_id
    )
  }

  // Return registered roles
  const roles = await query<{
    name: string
    description: string | null
    claims_from: string
    orchestrator_id: string
    created_at: string
  }>(
    db,
    'SELECT * FROM roles WHERE orchestrator_id = ?',
    body.orchestrator_id
  )

  return c.json({ roles })
})

/**
 * List all registered roles
 * GET /api/v1/roles
 */
rolesRoute.get('/', async (c) => {
  const db = c.env.DB

  const roles = await query<{
    name: string
    description: string | null
    claims_from: string
    orchestrator_id: string
    created_at: string
  }>(db, 'SELECT * FROM roles ORDER BY name ASC')

  return c.json({ roles })
})

/**
 * Get a specific role by name
 * GET /api/v1/roles/:name
 */
rolesRoute.get('/:name', async (c) => {
  const db = c.env.DB
  const name = c.req.param('name')

  const role = await queryOne<{
    name: string
    description: string | null
    claims_from: string
    orchestrator_id: string
    created_at: string
  }>(db, 'SELECT * FROM roles WHERE name = ?', name)

  if (!role) {
    return c.json({ error: 'Role not found' }, 404)
  }

  return c.json(role)
})
