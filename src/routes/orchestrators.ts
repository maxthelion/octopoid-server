/**
 * Orchestrator API routes
 */

import { Hono } from 'hono'
import type {
  Orchestrator,
  RegisterOrchestratorRequest,
  RegisterOrchestratorResponse,
  HeartbeatRequest,
  HeartbeatResponse,
  OrchestratorListResponse,
} from '../types/shared.js'
import type { Env } from '../index'
import { query, queryOne, execute } from '../database'
import { generateApiKey, hashKey, getAuthenticatedScope } from '../middleware/auth'

export const orchestratorsRoute = new Hono<{ Bindings: Env }>()

/**
 * Register orchestrator
 * POST /api/v1/orchestrators/register
 */
orchestratorsRoute.post('/register', async (c) => {
  const db = c.env.DB
  const body = (await c.req.json()) as RegisterOrchestratorRequest

  // Validate required fields
  if (!body.cluster || !body.machine_id || !body.repo_url) {
    return c.json(
      { error: 'Missing required fields: cluster, machine_id, repo_url' },
      400
    )
  }

  if (!body.scope) {
    return c.json(
      { error: 'Missing required field: scope. All orchestrators must register with a scope.' },
      400
    )
  }

  // Generate orchestrator ID
  const orchestratorId = `${body.cluster}-${body.machine_id}`

  // Check if orchestrator already exists
  const existing = await queryOne<Orchestrator>(
    db,
    'SELECT * FROM orchestrators WHERE id = ?',
    orchestratorId
  )

  const now = new Date().toISOString()

  if (existing) {
    // Update existing orchestrator (re-registration)
    await execute(
      db,
      `UPDATE orchestrators
       SET hostname = ?,
           repo_url = ?,
           last_heartbeat = ?,
           status = 'active',
           version = ?,
           capabilities = ?,
           scope = ?
       WHERE id = ?`,
      body.hostname || null,
      body.repo_url,
      now,
      body.version || null,
      body.capabilities ? JSON.stringify(body.capabilities) : null,
      body.scope,
      orchestratorId
    )
  } else {
    // Insert new orchestrator
    await execute(
      db,
      `INSERT INTO orchestrators (
        id, cluster, machine_id, hostname, repo_url,
        registered_at, last_heartbeat, status, version, capabilities, scope
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      orchestratorId,
      body.cluster,
      body.machine_id,
      body.hostname || null,
      body.repo_url,
      now,
      now,
      body.version || null,
      body.capabilities ? JSON.stringify(body.capabilities) : null,
      body.scope
    )
  }

  // API key handling: issue key on first scope registration
  let apiKey: string | undefined
  const existingKey = await queryOne<{ key_hash: string }>(
    db,
    'SELECT key_hash FROM api_keys WHERE scope = ?',
    body.scope
  )

  if (!existingKey) {
    // First registration for this scope — generate and store API key
    apiKey = generateApiKey()
    const keyHash = await hashKey(apiKey)
    await execute(
      db,
      'INSERT INTO api_keys (key_hash, scope) VALUES (?, ?)',
      keyHash,
      body.scope
    )
  } else {
    // Scope has a key — validate auth if provided
    const authScope = getAuthenticatedScope(c)
    if (authScope && authScope !== body.scope) {
      return c.json({ error: `Scope mismatch: authenticated as "${authScope}" but registering for "${body.scope}"` }, 403)
    }
  }

  const response: RegisterOrchestratorResponse = {
    orchestrator_id: orchestratorId,
    registered_at: now,
    status: 'active',
    ...(apiKey ? { api_key: apiKey } : {}),
  }

  return c.json(response, existing ? 200 : 201)
})

/**
 * Send heartbeat
 * POST /api/v1/orchestrators/:id/heartbeat
 */
orchestratorsRoute.post('/:id/heartbeat', async (c) => {
  const db = c.env.DB
  const orchestratorId = c.req.param('id')
  let body: HeartbeatRequest = {}
  try {
    body = await c.req.json()
  } catch {
    // Empty body is fine — timestamp defaults to now
  }

  // Check if orchestrator exists
  const orchestrator = await queryOne<Orchestrator>(
    db,
    'SELECT * FROM orchestrators WHERE id = ?',
    orchestratorId
  )

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not found' }, 404)
  }

  // Update last_heartbeat
  const now = body.timestamp || new Date().toISOString()
  await execute(
    db,
    `UPDATE orchestrators
     SET last_heartbeat = ?,
         status = 'active'
     WHERE id = ?`,
    now,
    orchestratorId
  )

  const response: HeartbeatResponse = {
    success: true,
    last_heartbeat: now,
  }

  return c.json(response)
})

/**
 * List orchestrators
 * GET /api/v1/orchestrators?cluster=prod&status=active
 */
orchestratorsRoute.get('/', async (c) => {
  const db = c.env.DB

  // Parse query parameters
  const cluster = c.req.query('cluster')
  const statusParam = c.req.query('status')

  // Build WHERE clause
  const conditions: string[] = []
  const params: unknown[] = []

  if (cluster) {
    conditions.push('cluster = ?')
    params.push(cluster)
  }

  if (statusParam) {
    const statuses = statusParam.split(',')
    conditions.push(`status IN (${statuses.map(() => '?').join(',')})`)
    params.push(...statuses)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Get orchestrators
  const orchestrators = await query<Orchestrator>(
    db,
    `SELECT * FROM orchestrators ${whereClause}
     ORDER BY last_heartbeat DESC`,
    ...params
  )

  const response: OrchestratorListResponse = {
    orchestrators,
    total: orchestrators.length,
  }

  return c.json(response)
})

/**
 * Get orchestrator by ID
 * GET /api/v1/orchestrators/:id
 */
orchestratorsRoute.get('/:id', async (c) => {
  const db = c.env.DB
  const orchestratorId = c.req.param('id')

  const orchestrator = await queryOne<Orchestrator>(
    db,
    'SELECT * FROM orchestrators WHERE id = ?',
    orchestratorId
  )

  if (!orchestrator) {
    return c.json({ error: 'Orchestrator not found' }, 404)
  }

  return c.json(orchestrator)
})

/**
 * Update orchestrator status (admin)
 * PATCH /api/v1/orchestrators/:id
 */
orchestratorsRoute.patch('/:id', async (c) => {
  const db = c.env.DB
  const orchestratorId = c.req.param('id')
  const body = await c.req.json()

  // Only allow updating status
  if (!body.status) {
    return c.json({ error: 'Missing field: status' }, 400)
  }

  const result = await execute(
    db,
    `UPDATE orchestrators
     SET status = ?
     WHERE id = ?`,
    body.status,
    orchestratorId
  )

  if (result.meta.changes === 0) {
    return c.json({ error: 'Orchestrator not found' }, 404)
  }

  const orchestrator = await queryOne<Orchestrator>(
    db,
    'SELECT * FROM orchestrators WHERE id = ?',
    orchestratorId
  )

  return c.json(orchestrator)
})

/**
 * Rotate API key for a scope
 * POST /api/v1/orchestrators/scopes/:scope/rotate-key
 */
orchestratorsRoute.post('/scopes/:scope/rotate-key', async (c) => {
  const db = c.env.DB
  const scope = c.req.param('scope')

  // Must be authenticated for this scope
  const authScope = getAuthenticatedScope(c)
  if (!authScope) {
    return c.json({ error: 'Authentication required. Provide your current API key in the Authorization header.' }, 401)
  }
  if (authScope !== scope) {
    return c.json({ error: `Scope mismatch: authenticated as "${authScope}" but rotating key for "${scope}"` }, 403)
  }

  // Generate new key
  const newKey = generateApiKey()
  const newHash = await hashKey(newKey)

  // Replace the old key hash
  const result = await execute(
    db,
    'UPDATE api_keys SET key_hash = ?, last_used_at = NULL WHERE scope = ?',
    newHash,
    scope
  )

  if (result.meta.changes === 0) {
    return c.json({ error: 'No API key found for this scope' }, 404)
  }

  return c.json({ api_key: newKey, scope })
})
