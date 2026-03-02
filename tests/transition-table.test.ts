/**
 * Unit tests for the shared transition table
 */

import { describe, it, expect } from 'vitest'
import { buildTransitionPatch } from '../src/transition-table'
import type { TransitionPatch } from '../src/transition-table'

describe('Transition Table', () => {
  describe('Rule matching', () => {
    it('exact match beats wildcard (claimed → provisional)', () => {
      const patch = buildTransitionPatch('claimed', 'provisional')
      // Should use the exact claimed→provisional rule, not * → *
      expect(patch.setClauses).toContain('needs_intervention = ?')
      expect(patch.params).toContain(0)
    })

    it('wildcard from matches any source queue (* → done)', () => {
      const patch = buildTransitionPatch('provisional', 'done')
      expect(patch.setClauses).toContain('queue = ?')
      expect(patch.params[0]).toBe('done')
      expect(patch.setClauses).toContain('claimed_by = ?')
    })

    it('wildcard from matches any source for incoming (* → incoming)', () => {
      const patch = buildTransitionPatch('provisional', 'incoming')
      expect(patch.setClauses).toContain('queue = ?')
      expect(patch.params[0]).toBe('incoming')
    })

    it('fallback * → * matches unknown transitions', () => {
      const patch = buildTransitionPatch('claimed', 'failed')
      expect(patch.setClauses).toContain('queue = ?')
      expect(patch.params[0]).toBe('failed')
      // Should still clear claim fields from the fallback rule
      expect(patch.setClauses).toContain('claimed_by = ?')
      expect(patch.setClauses).toContain('needs_intervention = ?')
    })
  })

  describe('Payload overrides', () => {
    it('payload overrides rule defaults', () => {
      // The rule sets claimed_by = null, but payload sets it to an agent name
      const patch = buildTransitionPatch('incoming', 'claimed', {
        claimed_by: 'agent-1',
      })
      // claimed_by should appear once with the payload value
      const claimedByIndices = patch.setClauses
        .map((c, i) => c === 'claimed_by = ?' ? i : -1)
        .filter(i => i >= 0)
      expect(claimedByIndices).toHaveLength(1)

      // Find the param corresponding to claimed_by
      // queue is first param, then merged fields follow
      const claimedByParam = findParamForClause(patch, 'claimed_by = ?')
      expect(claimedByParam).toBe('agent-1')
    })

    it('payload adds fields not in rule', () => {
      const patch = buildTransitionPatch('claimed', 'provisional', {
        commits_count: 5,
        turns_used: 10,
      })
      expect(patch.setClauses).toContain('commits_count = ?')
      expect(patch.setClauses).toContain('turns_used = ?')
      expect(patch.params).toContain(5)
      expect(patch.params).toContain(10)
    })
  })

  describe('Always-injected fields', () => {
    it('always includes queue, version bump, and updated_at', () => {
      const patch = buildTransitionPatch('claimed', 'provisional')
      expect(patch.setClauses).toContain('queue = ?')
      expect(patch.setClauses).toContain('version = version + 1')
      expect(patch.setClauses).toContain("updated_at = datetime('now')")
      expect(patch.params[0]).toBe('provisional')
    })
  })

  describe('SQL expressions', () => {
    it('sql FieldOp generates verbatim SQL, no param', () => {
      const patch = buildTransitionPatch('provisional', 'incoming', {
        rejection_count: { kind: 'sql', expr: 'rejection_count + 1' },
      })
      expect(patch.setClauses).toContain('rejection_count = rejection_count + 1')
      // The expression itself should NOT appear in params
      expect(patch.params).not.toContain('rejection_count + 1')
    })

    it('literal FieldOp uses parameterised binding', () => {
      const patch = buildTransitionPatch('claimed', 'provisional', {
        execution_notes: { kind: 'literal', value: 'some notes' },
      })
      expect(patch.setClauses).toContain('execution_notes = ?')
      expect(patch.params).toContain('some notes')
    })
  })

  describe('Clears claim and intervention fields', () => {
    const transitions: [string, string][] = [
      ['claimed', 'provisional'],
      ['claimed', 'needs_continuation'],
      ['provisional', 'done'],
      ['provisional', 'incoming'],
      ['claimed', 'failed'],  // fallback rule
    ]

    for (const [from, to] of transitions) {
      it(`${from} → ${to} clears all claim and intervention fields`, () => {
        const patch = buildTransitionPatch(from, to)
        expect(patch.setClauses).toContain('claimed_by = ?')
        expect(patch.setClauses).toContain('claimed_at = ?')
        expect(patch.setClauses).toContain('orchestrator_id = ?')
        expect(patch.setClauses).toContain('lease_expires_at = ?')
        expect(patch.setClauses).toContain('needs_intervention = ?')

        // All claim fields should be null
        expect(findParamForClause(patch, 'claimed_by = ?')).toBeNull()
        expect(findParamForClause(patch, 'claimed_at = ?')).toBeNull()
        expect(findParamForClause(patch, 'orchestrator_id = ?')).toBeNull()
        expect(findParamForClause(patch, 'lease_expires_at = ?')).toBeNull()
        // needs_intervention should be 0
        expect(findParamForClause(patch, 'needs_intervention = ?')).toBe(0)
      })
    }
  })
})

/**
 * Helper: find the param value for a given SET clause.
 * Counts '?' placeholders in order to map clause → param index.
 */
function findParamForClause(patch: TransitionPatch, clause: string): unknown {
  let paramIdx = 0
  for (const c of patch.setClauses) {
    if (c === clause) return patch.params[paramIdx]
    if (c.includes('?')) paramIdx++
  }
  throw new Error(`Clause "${clause}" not found in setClauses`)
}
