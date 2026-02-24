/**
 * Flow registration API routes
 */

import { Hono } from 'hono'
import type { Env } from '../index'
import { query, queryOne, execute } from '../database'
import { BUILT_IN_QUEUES } from '../types/shared.js'

export const flowsRoute = new Hono<{ Bindings: Env }>()

/**
 * Register or update a flow (upsert)
 * PUT /api/v1/flows/:name
 */
flowsRoute.put('/:name', async (c) => {
  const db = c.env.DB
  const name = c.req.param('name')
  const body = await c.req.json() as {
    scope?: string
    states: string[]
    transitions: Array<{ from: string; to: string }>
  }

  if (!body.scope) {
    return c.json({ error: 'Missing required field: scope' }, 400)
  }

  if (!body.states || !Array.isArray(body.states)) {
    return c.json({ error: 'Missing required field: states (array)' }, 400)
  }

  if (!body.transitions || !Array.isArray(body.transitions)) {
    return c.json({ error: 'Missing required field: transitions (array)' }, 400)
  }

  // Validate that states includes all built-in states
  for (const builtIn of BUILT_IN_QUEUES) {
    if (!body.states.includes(builtIn)) {
      return c.json(
        { error: `Flow states must include built-in state "${builtIn}". Got: ${body.states.join(', ')}` },
        400
      )
    }
  }

  const scope = body.scope
  const statesJson = JSON.stringify(body.states)
  const transitionsJson = JSON.stringify(body.transitions)

  // Upsert: INSERT OR REPLACE
  await execute(
    db,
    `INSERT OR REPLACE INTO flows (name, scope, states, transitions, registered_at, updated_at)
     VALUES (?, ?, ?, ?, COALESCE(
       (SELECT registered_at FROM flows WHERE name = ? AND scope = ?),
       datetime('now')
     ), datetime('now'))`,
    name, scope, statesJson, transitionsJson, name, scope
  )

  const flow = await queryOne<{
    name: string
    scope: string
    states: string
    transitions: string
    registered_at: string
    updated_at: string
  }>(db, 'SELECT * FROM flows WHERE name = ? AND scope = ?', name, scope)

  return c.json(flow)
})

/**
 * List all registered flows
 * GET /api/v1/flows
 */
flowsRoute.get('/', async (c) => {
  const db = c.env.DB
  const scope = c.req.query('scope')

  if (!scope) {
    return c.json({ error: 'Missing required query parameter: scope. Cannot list flows across all scopes.' }, 400)
  }

  const flows = await query<{
    name: string
    scope: string
    states: string
    transitions: string
    registered_at: string
    updated_at: string
  }>(db, 'SELECT * FROM flows WHERE scope = ? ORDER BY name ASC', scope)

  return c.json({ flows })
})

/**
 * Get a specific flow
 * GET /api/v1/flows/:name
 */
flowsRoute.get('/:name', async (c) => {
  const db = c.env.DB
  const name = c.req.param('name')
  const scope = c.req.query('scope')

  if (!scope) {
    return c.json({ error: 'Missing required query parameter: scope' }, 400)
  }

  const flow = await queryOne<{
    name: string
    scope: string
    states: string
    transitions: string
    registered_at: string
    updated_at: string
  }>(db, 'SELECT * FROM flows WHERE name = ? AND scope = ?', name, scope)

  if (!flow) {
    return c.json({ error: 'Flow not found' }, 404)
  }

  return c.json(flow)
})

/**
 * Delete a flow
 * DELETE /api/v1/flows/:name
 */
flowsRoute.delete('/:name', async (c) => {
  const db = c.env.DB
  const name = c.req.param('name')
  const scope = c.req.query('scope')

  if (!scope) {
    return c.json({ error: 'Missing required query parameter: scope' }, 400)
  }

  const result = await execute(
    db,
    'DELETE FROM flows WHERE name = ? AND scope = ?',
    name, scope
  )

  if (result.meta.changes === 0) {
    return c.json({ error: 'Flow not found' }, 404)
  }

  return c.json({ message: 'Flow deleted', name, scope })
})
