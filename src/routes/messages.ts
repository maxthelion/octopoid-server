/**
 * Messages routes - API endpoints for actor-model message passing
 * Messages are append-only (immutable). No edits, no deletes.
 */

import { Hono } from 'hono'
import type {
  Message,
  CreateMessageRequest,
  MessageListResponse,
} from '../types/shared.js'
import type { Env } from '../index'
import { query, queryOne } from '../database'

export const messagesRoute = new Hono<{ Bindings: Env }>()

/**
 * Create a new message
 * POST /api/v1/messages
 */
messagesRoute.post('/', async (c) => {
  const db = c.env.DB
  const body = await c.req.json<CreateMessageRequest>()

  // Validate required fields
  if (!body.task_id || !body.from_actor || !body.type || !body.content) {
    return c.json(
      { error: 'Missing required fields: task_id, from_actor, type, content' },
      400
    )
  }

  if (!body.scope) {
    return c.json(
      { error: 'Missing required field: scope. All messages must belong to a scope.' },
      400
    )
  }

  const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()

  await db
    .prepare(
      `INSERT INTO messages (id, task_id, from_actor, to_actor, type, content, created_at, scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      body.task_id,
      body.from_actor,
      body.to_actor || null,
      body.type,
      body.content,
      now,
      body.scope
    )
    .run()

  const message: Message = {
    id,
    task_id: body.task_id,
    from_actor: body.from_actor,
    to_actor: body.to_actor || null,
    type: body.type,
    content: body.content,
    created_at: now,
    scope: body.scope,
  }

  return c.json(message, 201)
})

/**
 * List messages with filters
 * GET /api/v1/messages?task_id=X&to_actor=Y&type=Z&scope=S
 */
messagesRoute.get('/', async (c) => {
  const db = c.env.DB

  const taskId = c.req.query('task_id')
  const toActor = c.req.query('to_actor')
  const type = c.req.query('type')
  const scopeParam = c.req.query('scope')
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  if (!scopeParam) {
    return c.json(
      { error: 'Missing required query parameter: scope. Cannot list messages across all scopes.' },
      400
    )
  }

  const conditions: string[] = ['scope = ?']
  const params: unknown[] = [scopeParam]

  if (taskId) {
    conditions.push('task_id = ?')
    params.push(taskId)
  }

  if (toActor) {
    conditions.push('to_actor = ?')
    params.push(toActor)
  }

  if (type) {
    conditions.push('type = ?')
    params.push(type)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  const countResult = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM messages ${whereClause}`,
    ...params
  )
  const total = countResult?.count || 0

  const results = await query<Message>(
    db,
    `SELECT * FROM messages ${whereClause} ORDER BY created_at ASC LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  )

  const response: MessageListResponse = {
    messages: results,
    total,
    offset,
    limit,
  }

  return c.json(response)
})
