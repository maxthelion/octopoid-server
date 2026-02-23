/**
 * Runtime queue validation against registered flows
 */

import type { D1Database } from '@cloudflare/workers-types'
import { BUILT_IN_QUEUES } from './types/shared.js'
import { queryOne } from './database'

const builtInSet = new Set<string>(BUILT_IN_QUEUES)

/**
 * Validate that a queue name is valid for the given flow.
 * Returns null if valid, or an error message string if invalid.
 *
 * - Built-in queues are always valid.
 * - If no flow is registered, validation is skipped (backwards compat).
 */
export async function validateQueue(
  db: D1Database,
  queue: string,
  flowName: string = 'default',
  cluster: string = 'default'
): Promise<string | null> {
  if (builtInSet.has(queue)) return null // always valid

  let flow: { states: string } | null
  try {
    flow = await queryOne<{ states: string }>(
      db,
      'SELECT states FROM flows WHERE name = ? AND cluster = ?',
      flowName, cluster
    )
  } catch {
    return null // table doesn't exist yet, skip validation
  }
  if (!flow) return null // no flow registered, allow anything (backwards compat)

  const validStates: string[] = JSON.parse(flow.states)
  if (validStates.includes(queue)) return null // valid

  return `Invalid queue "${queue}". Valid queues for flow "${flowName}": ${validStates.join(', ')}`
}

/**
 * Check whether a flow allows a specific queue transition.
 *
 * Returns:
 *   null  – no flow registered → caller should use hardcoded fallback
 *   true  – flow exists and the transition is allowed
 *   false – flow exists but the transition is NOT allowed
 */
export async function canTransition(
  db: D1Database,
  flowName: string,
  cluster: string,
  fromQueue: string,
  toQueue: string
): Promise<boolean | null> {
  let flow: { transitions: string } | null
  try {
    flow = await queryOne<{ transitions: string }>(
      db,
      'SELECT transitions FROM flows WHERE name = ? AND cluster = ?',
      flowName, cluster
    )
  } catch {
    return null // table doesn't exist yet
  }
  if (!flow) return null // no flow registered

  const transitions: Array<{ from: string; to: string }> = JSON.parse(flow.transitions)
  return transitions.some(t => t.from === fromQueue && t.to === toQueue)
}
