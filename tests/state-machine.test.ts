/**
 * State machine tests
 */

import { describe, it, expect } from 'vitest'
import { TRANSITIONS } from '../src/state-machine'

describe('State Machine', () => {
  describe('Transition Validation', () => {
    it('should have claim transition', () => {
      expect(TRANSITIONS.claim).toBeDefined()
      expect(TRANSITIONS.claim.from).toBe('incoming')
      expect(TRANSITIONS.claim.to).toBe('claimed')
    })

    it('should have submit transition', () => {
      expect(TRANSITIONS.submit).toBeDefined()
      expect(TRANSITIONS.submit.from).toBe('claimed')
      expect(TRANSITIONS.submit.to).toBe('provisional')
    })

    it('should have accept transition', () => {
      expect(TRANSITIONS.accept).toBeDefined()
      expect(TRANSITIONS.accept.from).toBe('provisional')
      expect(TRANSITIONS.accept.to).toBe('done')
    })

    it('should have reject transition', () => {
      expect(TRANSITIONS.reject).toBeDefined()
      expect(TRANSITIONS.reject.from).toBe('provisional')
      expect(TRANSITIONS.reject.to).toBe('incoming')
    })
  })

  describe('Guard Functions', () => {
    it('should validate dependencies_resolved guard', () => {
      const guardTypes = TRANSITIONS.claim.guards.map(g => g.type)
      expect(guardTypes).toContain('dependency_resolved')
    })

    it('should validate role_matches guard for claim', () => {
      const guardTypes = TRANSITIONS.claim.guards.map(g => g.type)
      expect(guardTypes).toContain('role_matches')
    })
  })

  describe('Side Effects', () => {
    it('should record history on all transitions', () => {
      for (const [, transition] of Object.entries(TRANSITIONS)) {
        const effectTypes = transition.side_effects.map(e => e.type)
        expect(effectTypes).toContain('record_history')
      }
    })

    it('should update lease on claim transition', () => {
      const effectTypes = TRANSITIONS.claim.side_effects.map(e => e.type)
      expect(effectTypes).toContain('update_lease')
    })

    it('should unblock dependents on accept transition', () => {
      const effectTypes = TRANSITIONS.accept.side_effects.map(e => e.type)
      expect(effectTypes).toContain('unblock_dependents')
    })
  })
})
