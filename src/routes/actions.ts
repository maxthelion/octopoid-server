/**
 * Actions routes - API endpoints for entity-bound proposals
 * Actions are proposed by agents, approved/executed by humans or scheduler.
 */

import { Hono } from 'hono'
import type {
  Action,
  CreateActionRequest,
  ActionListResponse,
} from '../types/shared.js'
import type { Env } from '../index'
import { query, queryOne } from '../database'

export const actionsRoute = new Hono<{ Bindings: Env }>()

/**
 * Create a new action
 * POST /api/v1/actions
 */
actionsRoute.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<CreateActionRequest>()

  if (!body.entity_type || !body.entity_id || !body.action_type || !body.label || !body.proposed_by) {
    return c.json(
      { error: 'Missing required fields: entity_type, entity_id, action_type, label, proposed_by' },
      400
    )
  }

  if (!body.scope) {
    return c.json(
      { error: 'Missing required field: scope. All actions must belong to a scope.' },
      400
    )
  }

  const id = `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO actions (id, entity_type, entity_id, action_type, label, description, status, proposed_by, proposed_at, expires_at, metadata, scope)
       VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      body.entity_type,
      body.entity_id,
      body.action_type,
      body.label,
      body.description || null,
      body.proposed_by,
      now,
      body.expires_at || null,
      body.metadata || null,
      body.scope
    )
    .run()

  const action: Action = {
    id,
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    action_type: body.action_type,
    label: body.label,
    description: body.description || null,
    status: 'proposed',
    proposed_by: body.proposed_by,
    proposed_at: now,
    executed_at: null,
    result: null,
    expires_at: body.expires_at || null,
    metadata: body.metadata || null,
    scope: body.scope,
  }

  return c.json(action, 201)
})

/**
 * List actions with filters
 * GET /api/v1/actions?entity_type=X&entity_id=Y&status=Z&scope=S
 */
actionsRoute.get('/', async (c) => {
  const db = c.env.DB

  const entityType = c.req.query('entity_type')
  const entityId = c.req.query('entity_id')
  const status = c.req.query('status')
  const scopeParam = c.req.query('scope')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  if (!scopeParam) {
    return c.json(
      { error: 'Missing required query parameter: scope. Cannot list actions across all scopes.' },
      400
    )
  }

  const conditions: string[] = ['scope = ?']
  const params: unknown[] = [scopeParam]

  // Exclude expired actions
  conditions.push("(expires_at IS NULL OR expires_at > datetime('now'))")

  if (entityType) {
    conditions.push('entity_type = ?')
    params.push(entityType)
  }

  if (entityId) {
    conditions.push('entity_id = ?')
    params.push(entityId)
  }

  if (status) {
    conditions.push('status = ?')
    params.push(status)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  const countResult = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM actions ${whereClause}`,
    ...params
  )
  const total = countResult?.count || 0

  const results = await query<Action>(
    db,
    `SELECT * FROM actions ${whereClause} ORDER BY proposed_at DESC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  )

  const response: ActionListResponse = {
    actions: results,
    total,
    offset,
    limit,
  }

  return c.json(response)
})

/**
 * Execute an action (human approval)
 * POST /api/v1/actions/:id/execute
 */
actionsRoute.post('/:id/execute', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')

  const action = await queryOne<Action>(
    db,
    'SELECT * FROM actions WHERE id = ?',
    id
  )

  if (!action) {
    return c.json({ error: 'Action not found' }, 404)
  }

  if (action.status !== 'proposed') {
    return c.json(
      { error: `Cannot execute action with status "${action.status}". Only "proposed" actions can be executed.` },
      400
    )
  }

  // Check if expired
  if (action.expires_at && new Date(action.expires_at) < new Date()) {
    return c.json({ error: 'Action has expired' }, 400)
  }

  const now = new Date().toISOString()

  await db
    .prepare('UPDATE actions SET status = ?, executed_at = ? WHERE id = ?')
    .bind('execute_requested', now, id)
    .run()

  const updated: Action = {
    ...action,
    status: 'execute_requested',
    executed_at: now,
  }

  return c.json(updated)
})

/**
 * Update action status/result (for handler callback)
 * PATCH /api/v1/actions/:id
 */
actionsRoute.patch('/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const body = await c.req.json<{ status?: string; result?: string }>()

  const action = await queryOne<Action>(
    db,
    'SELECT * FROM actions WHERE id = ?',
    id
  )

  if (!action) {
    return c.json({ error: 'Action not found' }, 404)
  }

  const updates: string[] = []
  const params: unknown[] = []

  if (body.status) {
    const validStatuses = ['proposed', 'execute_requested', 'executing', 'completed', 'failed', 'expired']
    if (!validStatuses.includes(body.status)) {
      return c.json({ error: `Invalid status "${body.status}". Valid statuses: ${validStatuses.join(', ')}` }, 400)
    }
    updates.push('status = ?')
    params.push(body.status)
  }

  if (body.result !== undefined) {
    updates.push('result = ?')
    params.push(body.result)
  }

  if (updates.length === 0) {
    return c.json({ error: 'No valid fields to update. Updatable fields: status, result' }, 400)
  }

  params.push(id)

  await db
    .prepare(`UPDATE actions SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run()

  const updated = await queryOne<Action>(
    db,
    'SELECT * FROM actions WHERE id = ?',
    id
  )

  return c.json(updated)
})
