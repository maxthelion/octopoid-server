/**
 * Scheduler poll endpoint
 * Returns combined queue state in a single call to minimize API requests
 */

import { Hono } from 'hono'
import type { Env } from '../index'
import { query, queryOne } from '../database'

export const schedulerRoute = new Hono<{ Bindings: Env }>()

/**
 * Poll scheduler state
 * GET /api/v1/scheduler/poll?orchestrator_id=<id>
 */
schedulerRoute.get('/poll', async (c) => {
  const db = c.env.DB
  const orchestratorId = c.req.query('orchestrator_id')

  // Run queries in parallel
  const [queueCountRows, provisionalTasks, orchestratorRow, flowRows] = await Promise.all([
    // 1. Queue counts for incoming, claimed, provisional
    query<{ queue: string; count: number }>(
      db,
      `SELECT queue, COUNT(*) as count FROM tasks
       WHERE queue IN ('incoming', 'claimed', 'provisional')
       GROUP BY queue`
    ),

    // 2. Provisional tasks (lightweight fields only)
    query<{ id: string; hooks: string | null; pr_number: number | null; claimed_by: string | null }>(
      db,
      `SELECT id, hooks, pr_number, claimed_by FROM tasks WHERE queue = 'provisional'`
    ),

    // 3. Orchestrator registration check
    orchestratorId
      ? queryOne<{ id: string }>(
          db,
          'SELECT id FROM orchestrators WHERE id = ?',
          orchestratorId
        )
      : Promise.resolve(null),

    // 4. Registered flows (gracefully handle missing table)
    query<{ name: string; states: string }>(
      db,
      'SELECT name, states FROM flows'
    ).catch(() => [] as { name: string; states: string }[]),
  ])

  // Build queue_counts with defaults for missing queues
  const queue_counts: Record<string, number> = {
    incoming: 0,
    claimed: 0,
    provisional: 0,
  }
  for (const row of queueCountRows) {
    queue_counts[row.queue] = row.count
  }

  // Build flows map
  const flows: Record<string, { states: string[] }> = {}
  for (const row of flowRows) {
    flows[row.name] = { states: JSON.parse(row.states) }
  }

  return c.json({
    queue_counts,
    provisional_tasks: provisionalTasks,
    orchestrator_registered: orchestratorId ? orchestratorRow !== null : false,
    flows,
  })
})
