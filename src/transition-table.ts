/**
 * Shared transition table for task state changes.
 *
 * Each transition endpoint (claim, submit, accept, reject, requeue, force-queue)
 * uses buildTransitionPatch() to generate its SET clause instead of hand-rolling
 * column assignments. Fields that should be cleared on a transition are declared
 * once in the rule table and applied consistently.
 */

export type FieldOp =
  | { kind: 'literal'; value: unknown }   // "col = ?" with param
  | { kind: 'sql'; expr: string }          // "col = <expr>" verbatim

export interface TransitionPatch {
  setClauses: string[]
  params: unknown[]
}

type FieldSets = Record<string, unknown | FieldOp>

interface TransitionRule {
  from: string
  to: string
  sets: FieldSets
}

function isFieldOp(v: unknown): v is FieldOp {
  return typeof v === 'object' && v !== null && 'kind' in v
}

const CLEAR_CLAIM_AND_INTERVENTION: FieldSets = {
  claimed_by: null,
  claimed_at: null,
  orchestrator_id: null,
  lease_expires_at: null,
  needs_intervention: 0,
}

const TRANSITION_RULES: TransitionRule[] = [
  // submit: claimed → provisional
  { from: 'claimed', to: 'provisional', sets: CLEAR_CLAIM_AND_INTERVENTION },

  // submit burnout: claimed → needs_continuation
  { from: 'claimed', to: 'needs_continuation', sets: CLEAR_CLAIM_AND_INTERVENTION },

  // accept: * → done
  { from: '*', to: 'done', sets: CLEAR_CLAIM_AND_INTERVENTION },

  // reject/requeue: * → incoming
  { from: '*', to: 'incoming', sets: CLEAR_CLAIM_AND_INTERVENTION },

  // fallback: any → any (covers force-queue to failed, custom queues, etc.)
  { from: '*', to: '*', sets: CLEAR_CLAIM_AND_INTERVENTION },
]

function findRule(from: string, to: string): TransitionRule {
  // Exact match first, then wildcard from, then wildcard to, then full wildcard
  return (
    TRANSITION_RULES.find(r => r.from === from && r.to === to) ||
    TRANSITION_RULES.find(r => r.from === from && r.to === '*') ||
    TRANSITION_RULES.find(r => r.from === '*' && r.to === to) ||
    TRANSITION_RULES.find(r => r.from === '*' && r.to === '*')!
  )
}

/**
 * Build a TransitionPatch for a state change.
 *
 * @param from   - current queue name
 * @param to     - target queue name
 * @param payload - endpoint-specific overrides (e.g. claimed_by, commits_count).
 *                  Values can be plain literals or FieldOp objects for SQL expressions.
 * @returns { setClauses, params } ready for `UPDATE tasks SET ${setClauses.join(', ')} WHERE ...`
 */
export function buildTransitionPatch(
  from: string,
  to: string,
  payload: FieldSets = {},
): TransitionPatch {
  const rule = findRule(from, to)

  // Merge: rule defaults, then payload wins
  const merged: FieldSets = { ...rule.sets, ...payload }

  // Always inject these (cannot be overridden)
  const setClauses: string[] = [
    'queue = ?',
    'version = version + 1',
    "updated_at = datetime('now')",
  ]
  const params: unknown[] = [to]

  for (const [col, raw] of Object.entries(merged)) {
    if (isFieldOp(raw)) {
      if (raw.kind === 'sql') {
        setClauses.push(`${col} = ${raw.expr}`)
      } else {
        setClauses.push(`${col} = ?`)
        params.push(raw.value)
      }
    } else {
      setClauses.push(`${col} = ?`)
      params.push(raw)
    }
  }

  return { setClauses, params }
}
