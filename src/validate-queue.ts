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
  flowName: string = 'default'
): Promise<string | null> {
  if (builtInSet.has(queue)) return null // always valid

  let flow: { states: string } | null
  try {
    flow = await queryOne<{ states: string }>(
      db,
      'SELECT states FROM flows WHERE name = ?',
      flowName
    )
  } catch {
    return null // table doesn't exist yet, skip validation
  }
  if (!flow) return null // no flow registered, allow anything (backwards compat)

  const validStates: string[] = JSON.parse(flow.states)
  if (validStates.includes(queue)) return null // valid

  return `Invalid queue "${queue}". Valid queues for flow "${flowName}": ${validStates.join(', ')}`
}
