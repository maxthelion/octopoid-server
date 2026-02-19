/**
 * Task API routes
 */

import { Hono } from 'hono'
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  ClaimTaskRequest,
  SubmitTaskRequest,
  AcceptTaskRequest,
  RejectTaskRequest,
  TaskListResponse,
} from '../types/shared.js'
import type { Env } from '../index'
import { query, queryOne, execute } from '../database'
// NOTE: executeTransition/TRANSITIONS from state-machine.ts are no longer used here.
// These endpoints now use inline atomic UPDATEs with optimistic locking instead.
import { getConfig } from '../config'

export const tasksRoute = new Hono<{ Bindings: Env }>()

/**
 * List tasks with filters
 * GET /api/v1/tasks?queue=incoming&priority=P1&role=implement&limit=50&offset=0
 */
tasksRoute.get('/', async (c) => {
  const db = c.env.DB
  const config = getConfig()

  // Parse query parameters
  const queueParam = c.req.query('queue')
  const priorityParam = c.req.query('priority')
  const roleParam = c.req.query('role')
  const claimedBy = c.req.query('claimed_by')
  const projectId = c.req.query('project_id')
  const limit = Math.min(
    parseInt(c.req.query('limit') || String(config.defaultPageSize)),
    config.maxPageSize
  )
  const offset = parseInt(c.req.query('offset') || '0')
  const sort = c.req.query('sort') // 'priority' for priority ASC, created_at ASC

  // Build WHERE clause
  const conditions: string[] = []
  const params: unknown[] = []

  if (queueParam) {
    const queues = queueParam.split(',')
    conditions.push(`queue IN (${queues.map(() => '?').join(',')})`)
    params.push(...queues)
  }

  if (priorityParam) {
    const priorities = priorityParam.split(',')
    conditions.push(`priority IN (${priorities.map(() => '?').join(',')})`)
    params.push(...priorities)
  }

  if (roleParam) {
    const roles = roleParam.split(',')
    conditions.push(`role IN (${roles.map(() => '?').join(',')})`)
    params.push(...roles)
  }

  if (claimedBy) {
    conditions.push('claimed_by = ?')
    params.push(claimedBy)
  }

  if (projectId) {
    conditions.push('project_id = ?')
    params.push(projectId)
  }

  const scopeParam = c.req.query('scope')
  if (scopeParam) {
    conditions.push('scope = ?')
    params.push(scopeParam)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  // Get total count
  const countResult = await queryOne<{ count: number }>(
    db,
    `SELECT COUNT(*) as count FROM tasks ${whereClause}`,
    ...params
  )
  const total = countResult?.count || 0

  // Get tasks
  const orderClause = sort === 'priority'
    ? 'ORDER BY priority ASC, created_at ASC'
    : 'ORDER BY created_at DESC'

  const tasks = await query<Task>(
    db,
    `SELECT * FROM tasks ${whereClause}
     ${orderClause}
     LIMIT ? OFFSET ?`,
    ...params,
    limit,
    offset
  )

  const response: TaskListResponse = {
    tasks,
    total,
    offset,
    limit,
  }

  return c.json(response)
})

/**
 * Get task by ID
 * GET /api/v1/tasks/:id
 */
tasksRoute.get('/:id', async (c) => {
  const db = c.env.DB
  const taskId = c.req.param('id')
  const scopeParam = c.req.query('scope')

  let sql = 'SELECT * FROM tasks WHERE id = ?'
  const params: unknown[] = [taskId]
  if (scopeParam) {
    sql += ' AND scope = ?'
    params.push(scopeParam)
  }

  const task = await queryOne<Task>(db, sql, ...params)

  if (!task) {
    return c.json({ error: 'Task not found', task_id: taskId }, 404)
  }

  return c.json(task)
})

/**
 * Create task
 * POST /api/v1/tasks
 */
tasksRoute.post('/', async (c) => {
  const db = c.env.DB
  const body = (await c.req.json()) as CreateTaskRequest

  // Validate required fields
  if (!body.id || !body.file_path) {
    return c.json(
      { error: 'Missing required fields: id, file_path' },
      400
    )
  }

  if (!body.branch) {
    return c.json(
      { error: 'Missing required field: branch. Caller must set branch explicitly.' },
      400
    )
  }

  // Validate role against registered roles (if any are registered)
  if (body.role) {
    const registeredRoles = await queryOne<{ count: number }>(db, 'SELECT COUNT(*) as count FROM roles')
    if (registeredRoles && registeredRoles.count > 0) {
      const role = await queryOne(db, 'SELECT name FROM roles WHERE name = ?', body.role)
      if (!role) {
        const allRoles = await query<{ name: string }>(db, 'SELECT name FROM roles ORDER BY name')
        const roleNames = allRoles.map(r => r.name).join(', ')
        return c.json({ error: `Unknown role '${body.role}'. Registered roles: ${roleNames}` }, 400)
      }
    }
  }

  // For project tasks, inherit the project's branch if it differs
  if (body.project_id) {
    const project = await queryOne<{ branch: string }>(
      db,
      'SELECT branch FROM projects WHERE id = ?',
      body.project_id
    )
    if (project?.branch) {
      body.branch = project.branch
    }
  }

  // Insert task
  const result = await execute(
    db,
    `INSERT INTO tasks (
      id, file_path, title, queue, priority, complexity, role, type, branch,
      blocked_by, project_id, auto_accept, hooks, flow, flow_overrides, scope, created_at, updated_at, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), 1)`,
    body.id,
    body.file_path,
    body.title || body.id,
    body.queue || 'incoming',
    body.priority || 'P2',
    body.complexity || null,
    body.role || null,
    body.type || null,
    body.branch || null,
    body.blocked_by || null,
    body.project_id || null,
    body.auto_accept || false,
    body.hooks || null,
    body.flow || 'default',
    body.flow_overrides || null,
    body.scope || null
  )

  if (!result.success) {
    return c.json({ error: 'Failed to create task' }, 500)
  }

  // Return created task
  const task = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', body.id)

  return c.json(task, 201)
})

/**
 * Update task
 * PATCH /api/v1/tasks/:id
 */
tasksRoute.patch('/:id', async (c) => {
  const db = c.env.DB
  const taskId = c.req.param('id')
  const body = (await c.req.json()) as UpdateTaskRequest

  // Guard: Prevent direct queue="done" transitions
  // The done queue should only be reached via POST /api/v1/tasks/:id/accept
  if (body.queue === 'done') {
    return c.json(
      {
        error: 'Cannot set queue to "done" via PATCH. Use POST /api/v1/tasks/:id/accept instead.',
      },
      400
    )
  }

  // Build SET clause dynamically
  const updates: string[] = []
  const params: unknown[] = []

  const fields = [
    'title',
    'queue',
    'priority',
    'complexity',
    'role',
    'type',
    'branch',
    'blocked_by',
    'claimed_by',
    'claimed_at',
    'commits_count',
    'turns_used',
    'attempt_count',
    'has_plan',
    'plan_id',
    'project_id',
    'auto_accept',
    'rejection_count',
    'pr_number',
    'pr_url',
    'checks',
    'check_results',
    'needs_rebase',
    'last_rebase_attempt_at',
    'staging_url',
    'submitted_at',
    'completed_at',
    'hooks',
    'flow',
    'flow_overrides',
  ]

  for (const field of fields) {
    if (field in body) {
      updates.push(`${field} = ?`)
      params.push((body as any)[field])
    }
  }

  if (updates.length === 0) {
    return c.json({ error: 'No fields to update' }, 400)
  }

  updates.push("updated_at = datetime('now')")

  const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`
  params.push(taskId)

  const result = await execute(db, sql, ...params)

  if (result.meta.changes === 0) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const task = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)

  return c.json(task)
})

/**
 * Record hook evidence
 * POST /api/v1/tasks/:id/hooks/:hookName/complete
 */
tasksRoute.post('/:id/hooks/:hookName/complete', async (c) => {
  const db = c.env.DB
  const taskId = c.req.param('id')
  const hookName = c.req.param('hookName')
  const body = await c.req.json() as { status: string; evidence?: Record<string, unknown> }

  if (!body.status || !['passed', 'failed'].includes(body.status)) {
    return c.json({ error: 'status must be "passed" or "failed"' }, 400)
  }

  // Get current task
  const task = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)
  if (!task) {
    return c.json({ error: 'Task not found' }, 404)
  }

  // Parse hooks
  let hooks: Array<Record<string, unknown>> = []
  if (task.hooks) {
    try {
      hooks = JSON.parse(task.hooks)
    } catch {
      return c.json({ error: 'Invalid hooks data on task' }, 500)
    }
  }

  // Find and update the matching hook
  let found = false
  for (const hook of hooks) {
    if (hook.name === hookName) {
      hook.status = body.status
      if (body.evidence) {
        hook.evidence = body.evidence
      }
      found = true
      break
    }
  }

  if (!found) {
    return c.json({ error: `Hook '${hookName}' not found on task` }, 404)
  }

  // Save updated hooks
  await execute(
    db,
    `UPDATE tasks SET hooks = ?, updated_at = datetime('now') WHERE id = ?`,
    JSON.stringify(hooks),
    taskId
  )

  const updated = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)
  return c.json(updated)
})

/**
 * Delete task
 * DELETE /api/v1/tasks/:id
 */
tasksRoute.delete('/:id', async (c) => {
  const db = c.env.DB
  const taskId = c.req.param('id')

  // Delete task and related records
  await execute(db, 'DELETE FROM task_history WHERE task_id = ?', taskId)
  const result = await execute(db, 'DELETE FROM tasks WHERE id = ?', taskId)

  if (result.meta.changes === 0) {
    return c.json({ error: 'Task not found' }, 404)
  }

  return c.json({ message: 'Task deleted', task_id: taskId })
})

/**
 * Claim task (atomic with lease)
 * POST /api/v1/tasks/claim
 */
tasksRoute.post('/claim', async (c) => {
  const db = c.env.DB
  const body = (await c.req.json()) as ClaimTaskRequest
  const config = getConfig()

  // Validate required fields
  if (!body.orchestrator_id || !body.agent_name) {
    return c.json(
      { error: 'Missing required fields: orchestrator_id, agent_name' },
      400
    )
  }

  // Validate role_filter against registered roles (if any are registered)
  if (body.role_filter) {
    const roles = Array.isArray(body.role_filter) ? body.role_filter : [body.role_filter]
    const registeredRoles = await queryOne<{ count: number }>(db, 'SELECT COUNT(*) as count FROM roles')
    if (registeredRoles && registeredRoles.count > 0) {
      for (const roleName of roles) {
        const role = await queryOne(db, 'SELECT name FROM roles WHERE name = ?', roleName)
        if (!role) {
          const allRoles = await query<{ name: string }>(db, 'SELECT name FROM roles ORDER BY name')
          const roleNames = allRoles.map(r => r.name).join(', ')
          return c.json({ error: `Unknown role '${roleName}'. Registered roles: ${roleNames}` }, 400)
        }
      }
    }
  }

  // Build WHERE clauses for role and type filters
  let roleCondition = ''
  let typeCondition = ''
  const params: unknown[] = []

  if (body.role_filter) {
    const roles = Array.isArray(body.role_filter)
      ? body.role_filter
      : [body.role_filter]
    roleCondition = `AND role IN (${roles.map(() => '?').join(',')})`
    params.push(...roles)
  }

  if (body.type_filter) {
    const types = Array.isArray(body.type_filter)
      ? body.type_filter
      : [body.type_filter]
    typeCondition = `AND type IN (${types.map(() => '?').join(',')})`
    params.push(...types)
  }

  let scopeCondition = ''
  if (body.scope) {
    scopeCondition = 'AND scope = ?'
    params.push(body.scope)
  }

  // Determine which queue to claim from
  let claimQueue = body.queue || 'incoming'
  if (body.role_filter && !body.queue) {
    const roleName = Array.isArray(body.role_filter) ? body.role_filter[0] : body.role_filter
    const role = await queryOne<{ claims_from: string }>(
      db,
      'SELECT claims_from FROM roles WHERE name = ?',
      roleName
    )
    if (role?.claims_from) {
      claimQueue = role.claims_from
    }
  }

  // Find available task (no blocked_by, in the target queue)
  const claimParams = [claimQueue, ...params]
  const task = await queryOne<Task>(
    db,
    `SELECT * FROM tasks
     WHERE queue = ?
     AND (blocked_by IS NULL OR blocked_by = '')
     ${roleCondition}
     ${typeCondition}
     ${scopeCondition}
     ORDER BY priority ASC, created_at ASC
     LIMIT 1`,
    ...claimParams
  )

  if (!task) {
    return c.json({ message: 'No tasks available' }, 404)
  }

  // Guards: dependency_resolved (already filtered by query above), role_matches (already filtered by roleCondition)

  // Atomic claim: queue transition + metadata in a single UPDATE with optimistic locking
  const leaseDuration = body.lease_duration_seconds || config.defaultLeaseDurationSeconds
  const newVersion = task.version + 1
  const leaseExpiry = new Date(Date.now() + leaseDuration * 1000).toISOString()

  const targetQueue = claimQueue === 'provisional' ? 'provisional' : 'claimed'
  const result = await execute(db,
    `UPDATE tasks
     SET queue = ?,
         version = ?,
         claimed_by = ?,
         claimed_at = datetime('now'),
         lease_expires_at = ?,
         orchestrator_id = ?,
         updated_at = datetime('now')
     WHERE id = ? AND queue = ? AND version = ?`,
    targetQueue,
    newVersion,
    body.agent_name,
    leaseExpiry,
    body.orchestrator_id,
    task.id,
    claimQueue,
    task.version
  )

  if (result.meta.changes === 0) {
    return c.json({ error: 'Failed to claim task (race or wrong state)' }, 409)
  }

  // Side effect: record history
  const historyEvent = claimQueue === 'provisional' ? 'review_claimed' : 'claimed'
  await execute(db,
    `INSERT INTO task_history (task_id, event, agent, timestamp)
     VALUES (?, ?, ?, datetime('now'))`,
    task.id, historyEvent, body.agent_name
  )

  // Return claimed task
  const claimedTask = await queryOne<Task>(
    db,
    'SELECT * FROM tasks WHERE id = ?',
    task.id
  )

  return c.json(claimedTask)
})

/**
 * Submit task completion
 * POST /api/v1/tasks/:id/submit
 */
tasksRoute.post('/:id/submit', async (c) => {
  const db = c.env.DB
  const taskId = c.req.param('id')
  const body = (await c.req.json()) as SubmitTaskRequest

  // Validate required fields
  if (body.commits_count === undefined || body.turns_used === undefined) {
    return c.json(
      { error: 'Missing required fields: commits_count, turns_used' },
      400
    )
  }

  // Get current task state
  const task = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)
  if (!task) {
    return c.json({ error: 'Task not found', task_id: taskId }, 404)
  }

  if (task.queue !== 'claimed') {
    return c.json(
      { error: 'Failed to submit task', details: [`Invalid transition: task is in ${task.queue}, expected claimed`] },
      409
    )
  }

  // Guard: lease_valid
  if (!task.lease_expires_at || new Date(task.lease_expires_at) < new Date()) {
    return c.json(
      { error: 'Failed to submit task', details: [task.lease_expires_at ? 'Lease has expired' : 'No active lease'] },
      409
    )
  }

  // Burnout detection: Check if agent is stuck
  const BURNOUT_TURN_THRESHOLD = 80
  const MAX_TURN_LIMIT = 100
  let burnoutDetected = false

  if (body.commits_count === 0 && body.turns_used >= BURNOUT_TURN_THRESHOLD) {
    burnoutDetected = true
    console.warn(
      `⚠️  Burnout detected for task ${taskId}: 0 commits, ${body.turns_used} turns`
    )
  } else if (body.turns_used >= MAX_TURN_LIMIT) {
    burnoutDetected = true
    console.warn(
      `⚠️  Turn limit reached for task ${taskId}: ${body.turns_used}/${MAX_TURN_LIMIT}`
    )
  }

  const targetQueue = burnoutDetected ? 'needs_continuation' : 'provisional'

  // Atomic submit: queue transition + metadata in a single UPDATE with optimistic locking
  const result = await execute(db,
    `UPDATE tasks
     SET queue = ?,
         version = version + 1,
         commits_count = ?,
         turns_used = ?,
         check_results = ?,
         execution_notes = ?,
         submitted_at = datetime('now'),
         updated_at = datetime('now')
     WHERE id = ? AND queue = 'claimed' AND version = ?`,
    targetQueue,
    body.commits_count,
    body.turns_used,
    body.check_results || null,
    body.execution_notes || null,
    taskId,
    task.version
  )

  if (result.meta.changes === 0) {
    return c.json({ error: 'Failed to submit task (race or wrong state)' }, 409)
  }

  // Side effect: record history
  await execute(db,
    `INSERT INTO task_history (task_id, event, agent, timestamp)
     VALUES (?, ?, ?, datetime('now'))`,
    taskId, 'submitted', task.claimed_by || null
  )

  // Record burnout event if detected
  if (burnoutDetected) {
    await execute(
      db,
      `INSERT INTO task_history (task_id, event, details, timestamp)
       VALUES (?, ?, ?, datetime('now'))`,
      taskId,
      'burnout_detected',
      JSON.stringify({
        commits_count: body.commits_count,
        turns_used: body.turns_used,
        threshold: BURNOUT_TURN_THRESHOLD,
      })
    )
  }

  const updatedTask = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)

  return c.json(updatedTask)
})

/**
 * Accept task
 * POST /api/v1/tasks/:id/accept
 */
tasksRoute.post('/:id/accept', async (c) => {
  const db = c.env.DB
  const taskId = c.req.param('id')
  const body = (await c.req.json()) as AcceptTaskRequest

  if (!body.accepted_by) {
    return c.json({ error: 'Missing required field: accepted_by' }, 400)
  }

  // Get current task state
  const task = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)
  if (!task) {
    return c.json({ error: 'Task not found', task_id: taskId }, 404)
  }

  if (task.queue !== 'provisional') {
    return c.json(
      { error: 'Failed to accept task', details: [`Invalid transition: task is in ${task.queue}, expected provisional`] },
      409
    )
  }

  // Atomic accept: queue transition + completed_at in a single UPDATE with optimistic locking
  const completedAt = body.completed_at || new Date().toISOString()
  const result = await execute(db,
    `UPDATE tasks
     SET queue = 'done',
         version = version + 1,
         completed_at = ?,
         updated_at = datetime('now')
     WHERE id = ? AND queue = 'provisional' AND version = ?`,
    completedAt,
    taskId,
    task.version
  )

  if (result.meta.changes === 0) {
    return c.json({ error: 'Failed to accept task (race or wrong state)' }, 409)
  }

  // Side effects: record history, unblock dependents
  await execute(db,
    `INSERT INTO task_history (task_id, event, agent, timestamp)
     VALUES (?, ?, ?, datetime('now'))`,
    taskId, 'accepted', body.accepted_by
  )

  await execute(db,
    `UPDATE tasks
     SET blocked_by = NULL, updated_at = datetime('now')
     WHERE blocked_by = ?`,
    taskId
  )

  const updatedTask = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)

  return c.json(updatedTask)
})

/**
 * Reject task
 * POST /api/v1/tasks/:id/reject
 */
tasksRoute.post('/:id/reject', async (c) => {
  const db = c.env.DB
  const taskId = c.req.param('id')
  const body = (await c.req.json()) as RejectTaskRequest

  if (!body.reason || !body.rejected_by) {
    return c.json(
      { error: 'Missing required fields: reason, rejected_by' },
      400
    )
  }

  // Get current task state
  const task = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)
  if (!task) {
    return c.json({ error: 'Task not found', task_id: taskId }, 404)
  }

  if (task.queue !== 'provisional') {
    return c.json(
      { error: 'Failed to reject task', details: [`Invalid transition: task is in ${task.queue}, expected provisional`] },
      409
    )
  }

  // Atomic reject: queue transition + cleanup in a single UPDATE with optimistic locking
  const result = await execute(db,
    `UPDATE tasks
     SET queue = 'incoming',
         version = version + 1,
         rejection_count = rejection_count + 1,
         claimed_by = NULL,
         claimed_at = NULL,
         orchestrator_id = NULL,
         lease_expires_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? AND queue = 'provisional' AND version = ?`,
    taskId,
    task.version
  )

  if (result.meta.changes === 0) {
    return c.json({ error: 'Failed to reject task (race or wrong state)' }, 409)
  }

  // Side effect: record history
  await execute(db,
    `INSERT INTO task_history (task_id, event, agent, timestamp)
     VALUES (?, ?, ?, datetime('now'))`,
    taskId, 'rejected', body.rejected_by
  )

  const updatedTask = await queryOne<Task>(db, 'SELECT * FROM tasks WHERE id = ?', taskId)

  return c.json(updatedTask)
})
