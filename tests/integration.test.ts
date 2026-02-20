/**
 * Server Integration Tests
 * Tests actual HTTP endpoints and database operations
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { unstable_dev } from 'wrangler'
import type { UnstableDevWorker } from 'wrangler'

const TEST_SCOPE = 'test-scope'

describe('Server Integration Tests', () => {
  let worker: UnstableDevWorker
  let baseUrl: string

  beforeAll(async () => {
    // Start wrangler dev server for testing
    worker = await unstable_dev('src/index.ts', {
      experimental: { disableExperimentalWarning: true },
    })
    baseUrl = `http://localhost:${worker.port}`
  }, 30000)

  afterAll(async () => {
    await worker.stop()
  })

  describe('Health Check', () => {
    it('should return healthy status', async () => {
      const response = await fetch(`${baseUrl}/api/health`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        status: 'healthy',
        version: '2.0.0',
        database: 'connected',
      })
      expect(data.timestamp).toBeDefined()
    })
  })

  describe('Orchestrator Registration', () => {
    it('should register a new orchestrator', async () => {
      const response = await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'test-machine-1',
          repo_url: 'https://github.com/test/repo',
          capabilities: { roles: ['implement', 'test'] },
          version: '2.0.0',
          scope: TEST_SCOPE,
        }),
      })

      const data = await response.json()

      expect([200, 201]).toContain(response.status)
      expect(data.orchestrator_id).toBe('test-test-machine-1')
      expect(data.registered_at).toBeDefined()
    })

    it('should return existing orchestrator on re-registration', async () => {
      // First registration
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'test-machine-2',
          repo_url: 'https://github.com/test/repo',
          scope: TEST_SCOPE,
        }),
      })

      // Second registration (should update, not create new)
      const response = await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'test-machine-2',
          repo_url: 'https://github.com/test/repo',
          scope: TEST_SCOPE,
        }),
      })

      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.orchestrator_id).toBe('test-test-machine-2')
    })

    it('should reject registration without scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'no-scope-orch',
          repo_url: 'https://github.com/test/repo',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('scope')
    })
  })

  describe('Heartbeat', () => {
    it('should accept heartbeat from registered orchestrator', async () => {
      // Register first
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'test-machine-3',
          repo_url: 'https://github.com/test/repo',
          scope: TEST_SCOPE,
        }),
      })

      // Send heartbeat
      const response = await fetch(
        `${baseUrl}/api/v1/orchestrators/test-test-machine-3/heartbeat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
          }),
        }
      )

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.success).toBe(true)
    })
  })

  describe('Task CRUD Operations', () => {
    it('should create a new task', async () => {
      const taskId = `test-task-${Date.now()}`
      const response = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          queue: 'incoming',
          priority: 'P1',
          role: 'implement',
          branch: 'main',
          scope: TEST_SCOPE,
        }),
      })

      const data = await response.json()
      expect(response.status).toBe(201)
      expect(data.id).toBe(taskId)
      expect(data.queue).toBe('incoming')
      expect(data.priority).toBe('P1')
      expect(data.scope).toBe(TEST_SCOPE)
    })

    it('should reject task creation without scope', async () => {
      const taskId = `test-task-no-scope-${Date.now()}`
      const response = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          branch: 'main',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('scope')
    })

    it('should list tasks with scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks?scope=${TEST_SCOPE}`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks).toBeDefined()
      expect(Array.isArray(data.tasks)).toBe(true)
      expect(data.total).toBeGreaterThanOrEqual(0)
    })

    it('should reject listing tasks without scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks`)
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('scope')
    })

    it('should filter tasks by queue', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks?queue=incoming&scope=${TEST_SCOPE}`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.tasks).toBeDefined()
      data.tasks.forEach((task: any) => {
        expect(task.queue).toBe('incoming')
      })
    })

    it('should get a task by ID', async () => {
      // Create a task first
      const taskId = `test-task-get-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          queue: 'incoming',
          priority: 'P2',
          branch: 'main',
          scope: TEST_SCOPE,
        }),
      })

      // Get the task
      const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.id).toBe(taskId)
      expect(data.priority).toBe('P2')
    })
  })

  describe('Task Lifecycle', () => {
    // Use unique scope per lifecycle test to prevent claim cross-contamination
    const CLAIM_SCOPE = `lifecycle-claim-${Date.now()}`
    const SUBMIT_SCOPE = `lifecycle-submit-${Date.now()}`
    const ACCEPT_SCOPE = `lifecycle-accept-${Date.now()}`
    const REJECT_SCOPE = `lifecycle-reject-${Date.now()}`

    it('should claim a task', async () => {
      // Register orchestrator
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'claim-test',
          repo_url: 'https://github.com/test/repo',
          scope: CLAIM_SCOPE,
        }),
      })

      // Create a task
      const taskId = `test-task-claim-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          queue: 'incoming',
          priority: 'P1',
          role: 'implement',
          branch: 'main',
          scope: CLAIM_SCOPE,
        }),
      })

      // Claim the task
      const response = await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'test-claim-test',
          agent_name: 'test-agent',
          role_filter: 'implement',
          scope: CLAIM_SCOPE,
        }),
      })

      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.id).toBe(taskId)
      expect(data.queue).toBe('claimed')
      expect(data.claimed_by).toBe('test-agent')
      expect(data.lease_expires_at).toBeDefined()
    })

    it('should reject claim without scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'test-claim-test',
          agent_name: 'test-agent',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('scope')
    })

    it('should submit a claimed task', async () => {
      // Register orchestrator
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'submit-test',
          repo_url: 'https://github.com/test/repo',
          scope: SUBMIT_SCOPE,
        }),
      })

      // Create and claim a task
      const taskId = `test-task-submit-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          queue: 'incoming',
          priority: 'P1',
          role: 'implement',
          branch: 'main',
          scope: SUBMIT_SCOPE,
        }),
      })

      await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'test-submit-test',
          agent_name: 'test-agent',
          role_filter: 'implement',
          scope: SUBMIT_SCOPE,
        }),
      })

      // Submit the task
      const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commits_count: 3,
          turns_used: 10,
          check_results: 'all passed',
        }),
      })

      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.queue).toBe('provisional')
      expect(data.commits_count).toBe(3)
      expect(data.submitted_at).toBeDefined()
    })

    it('should accept a provisional task', async () => {
      // Register orchestrator
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'accept-test',
          repo_url: 'https://github.com/test/repo',
          scope: ACCEPT_SCOPE,
        }),
      })

      // Create, claim, and submit a task
      const taskId = `test-task-accept-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          queue: 'incoming',
          priority: 'P1',
          role: 'implement',
          branch: 'main',
          scope: ACCEPT_SCOPE,
        }),
      })

      await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'test-accept-test',
          agent_name: 'test-agent',
          role_filter: 'implement',
          scope: ACCEPT_SCOPE,
        }),
      })

      await fetch(`${baseUrl}/api/v1/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commits_count: 2,
          turns_used: 5,
        }),
      })

      // Accept the task
      const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accepted_by: 'test-reviewer',
        }),
      })

      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.queue).toBe('done')
      expect(data.completed_at).toBeDefined()
    })

    it('should reject a provisional task', async () => {
      // Register orchestrator
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'reject-test',
          repo_url: 'https://github.com/test/repo',
          scope: REJECT_SCOPE,
        }),
      })

      // Create, claim, and submit a task
      const taskId = `test-task-reject-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          queue: 'incoming',
          priority: 'P1',
          role: 'implement',
          branch: 'main',
          scope: REJECT_SCOPE,
        }),
      })

      await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'test-reject-test',
          agent_name: 'test-agent',
          role_filter: 'implement',
          scope: REJECT_SCOPE,
        }),
      })

      await fetch(`${baseUrl}/api/v1/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commits_count: 1,
          turns_used: 3,
        }),
      })

      // Reject the task
      const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Tests failing',
          rejected_by: 'test-reviewer',
        }),
      })

      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.queue).toBe('incoming')
      expect(data.rejection_count).toBe(1)
    })
  })

  describe('Error Handling', () => {
    it('should return 404 for non-existent task', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks/non-existent-task`)
      expect(response.status).toBe(404)
    })

    it('should return 400 for invalid task creation', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Missing required fields
          id: 'invalid-task',
        }),
      })
      expect(response.status).toBe(400)
    })

    it('should return 404 when claiming with no available tasks', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'test-no-tasks',
          agent_name: 'test-agent',
          scope: 'nonexistent-scope',
        }),
      })
      expect(response.status).toBe(404)
    })

    it('should reject PATCH with queue=done', async () => {
      // Create a task
      const taskId = `test-task-patch-done-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          queue: 'incoming',
          priority: 'P1',
          role: 'implement',
          branch: 'main',
          scope: TEST_SCOPE,
        }),
      })

      // Try to PATCH queue to "done" (should fail)
      const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queue: 'done',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Cannot set queue to "done"')
      expect(data.error).toContain('/accept')
    })
  })

  describe('Roles', () => {
    const orchestratorId = 'test-roles-orch'
    const ROLES_SCOPE = `roles-${Date.now()}`

    beforeAll(async () => {
      // Register an orchestrator for role tests
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'roles-orch',
          repo_url: 'https://github.com/test/repo',
          scope: ROLES_SCOPE,
        }),
      })
    })

    it('should register roles and list them', async () => {
      const response = await fetch(`${baseUrl}/api/v1/roles/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: orchestratorId,
          roles: [
            { name: 'implement', claims_from: 'incoming', description: 'Code implementation' },
            { name: 'review', claims_from: 'provisional', description: 'Code review' },
          ],
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.roles).toBeDefined()
      expect(data.roles.length).toBeGreaterThanOrEqual(2)

      // List all roles
      const listResponse = await fetch(`${baseUrl}/api/v1/roles`)
      const listData = await listResponse.json()
      expect(listResponse.status).toBe(200)
      expect(listData.roles.length).toBeGreaterThanOrEqual(2)
    })

    it('should get a role by name', async () => {
      const response = await fetch(`${baseUrl}/api/v1/roles/implement`)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.name).toBe('implement')
      expect(data.claims_from).toBe('incoming')
    })

    it('should return 404 for unknown role', async () => {
      const response = await fetch(`${baseUrl}/api/v1/roles/nonexistent`)
      expect(response.status).toBe(404)
    })

    it('should return 400 when registering roles for unknown orchestrator', async () => {
      const response = await fetch(`${baseUrl}/api/v1/roles/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'does-not-exist',
          roles: [{ name: 'test' }],
        }),
      })

      expect(response.status).toBe(400)
    })

    it('should reject task creation with invalid role when roles are registered', async () => {
      const taskId = `test-task-bad-role-${Date.now()}`
      const response = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          role: 'nonexistent-role',
          branch: 'main',
          scope: ROLES_SCOPE,
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Unknown role')
      expect(data.error).toContain('nonexistent-role')
    })

    it('should allow task creation with valid registered role', async () => {
      const taskId = `test-task-good-role-${Date.now()}`
      const response = await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          role: 'implement',
          branch: 'main',
          scope: ROLES_SCOPE,
        }),
      })

      expect(response.status).toBe(201)
      const data = await response.json()
      expect(data.role).toBe('implement')
    })

    it('should use role claims_from when claiming without explicit queue', async () => {
      const CLAIMS_FROM_SCOPE = `roles-claims-from-${Date.now()}`
      // Create a task in the 'provisional' queue with role 'review'
      const taskId = `test-task-claims-from-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          role: 'review',
          queue: 'provisional',
          branch: 'main',
          scope: CLAIMS_FROM_SCOPE,
        }),
      })

      // Claim with role_filter=review — should look in 'provisional' queue (from role's claims_from)
      const response = await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: orchestratorId,
          agent_name: 'review-agent',
          role_filter: 'review',
          scope: CLAIMS_FROM_SCOPE,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.id).toBe(taskId)
      // claim_for_review: task stays in provisional (not moved to claimed)
      expect(data.queue).toBe('provisional')
    })

    it('should reject claim with invalid role_filter when roles are registered', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: orchestratorId,
          agent_name: 'test-agent',
          role_filter: 'nonexistent-role',
          scope: ROLES_SCOPE,
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Unknown role')
      expect(data.error).toContain('nonexistent-role')
    })

    it('should allow claim with valid role_filter when roles are registered', async () => {
      const VALID_ROLE_SCOPE = `roles-valid-claim-${Date.now()}`
      const taskId = `test-task-claim-valid-role-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/incoming/${taskId}.md`,
          role: 'implement',
          queue: 'incoming',
          branch: 'main',
          scope: VALID_ROLE_SCOPE,
        }),
      })

      const response = await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: orchestratorId,
          agent_name: 'test-agent',
          role_filter: 'implement',
          scope: VALID_ROLE_SCOPE,
        }),
      })

      expect(response.status).toBe(200)
      const data = await response.json()
      expect(data.id).toBe(taskId)
    })

    it('should be idempotent on re-registration', async () => {
      // Register same roles again
      const response = await fetch(`${baseUrl}/api/v1/roles/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: orchestratorId,
          roles: [
            { name: 'implement', claims_from: 'incoming', description: 'Updated description' },
          ],
        }),
      })

      expect(response.status).toBe(200)

      // Verify description was updated
      const getResponse = await fetch(`${baseUrl}/api/v1/roles/implement`)
      const data = await getResponse.json()
      expect(data.description).toBe('Updated description')
    })
  })

  describe('Scheduler Poll', () => {
    it('should return queue counts, provisional tasks, and orchestrator status', async () => {
      const orchestratorId = 'test-sched-poll'

      // Register orchestrator
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'sched-poll',
          repo_url: 'https://github.com/test/repo',
          scope: TEST_SCOPE,
        }),
      })

      // Create an incoming task
      const incomingId = `test-poll-incoming-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: incomingId,
          file_path: `tasks/${incomingId}.md`,
          queue: 'incoming',
          role: 'implement',
          branch: 'main',
          scope: TEST_SCOPE,
        }),
      })

      // Create a provisional task with hooks and pr_number
      const provId = `test-poll-prov-${Date.now()}`
      const hooks = JSON.stringify([{ name: 'ci', status: 'pending' }])
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: provId,
          file_path: `tasks/${provId}.md`,
          queue: 'provisional',
          role: 'review',
          branch: 'main',
          hooks,
          scope: TEST_SCOPE,
        }),
      })

      // Set pr_number via PATCH (not included in task creation)
      await fetch(`${baseUrl}/api/v1/tasks/${provId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pr_number: 87 }),
      })

      // Poll
      const response = await fetch(
        `${baseUrl}/api/v1/scheduler/poll?orchestrator_id=${orchestratorId}`
      )
      const data = await response.json() as any

      expect(response.status).toBe(200)

      // Queue counts
      expect(data.queue_counts).toBeDefined()
      expect(typeof data.queue_counts.incoming).toBe('number')
      expect(typeof data.queue_counts.claimed).toBe('number')
      expect(typeof data.queue_counts.provisional).toBe('number')
      expect(data.queue_counts.incoming).toBeGreaterThanOrEqual(1)
      expect(data.queue_counts.provisional).toBeGreaterThanOrEqual(1)

      // Provisional tasks
      expect(Array.isArray(data.provisional_tasks)).toBe(true)
      const provTask = data.provisional_tasks.find((t: any) => t.id === provId)
      expect(provTask).toBeDefined()
      expect(provTask.hooks).toBe(hooks)
      expect(provTask.pr_number).toBe(87)
      expect('claimed_by' in provTask).toBe(true)

      // Orchestrator registered
      expect(data.orchestrator_registered).toBe(true)
      expect(data.scope).toBe(TEST_SCOPE)
    })

    it('should return 400 for unknown orchestrator without scope fallback', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/scheduler/poll?orchestrator_id=does-not-exist`
      )

      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.error).toContain('scope')
    })

    it('should accept explicit scope query param as fallback', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/scheduler/poll?scope=${TEST_SCOPE}`
      )
      const data = await response.json() as any

      expect(response.status).toBe(200)
      expect(data.orchestrator_registered).toBe(false)
      expect(data.queue_counts).toBeDefined()
      expect(Array.isArray(data.provisional_tasks)).toBe(true)
      expect(data.scope).toBe(TEST_SCOPE)
    })

    it('should return 400 when no orchestrator_id or scope provided', async () => {
      const response = await fetch(`${baseUrl}/api/v1/scheduler/poll`)
      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.error).toContain('scope')
    })
  })

  describe('Scope Isolation', () => {
    const SCOPE_A = 'scope-a'
    const SCOPE_B = 'scope-b'

    beforeAll(async () => {
      // Register orchestrators for each scope
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'iso-a',
          repo_url: 'https://github.com/test/repo-a',
          scope: SCOPE_A,
        }),
      })
      await fetch(`${baseUrl}/api/v1/orchestrators/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cluster: 'test',
          machine_id: 'iso-b',
          repo_url: 'https://github.com/test/repo-b',
          scope: SCOPE_B,
        }),
      })
    })

    it('should not claim tasks from a different scope', async () => {
      // Create task in scope A
      const taskId = `test-iso-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/${taskId}.md`,
          queue: 'incoming',
          branch: 'main',
          scope: SCOPE_A,
        }),
      })

      // Try to claim with scope B — should find nothing
      const response = await fetch(`${baseUrl}/api/v1/tasks/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrator_id: 'test-iso-b',
          agent_name: 'agent-b',
          scope: SCOPE_B,
        }),
      })

      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.message).toBe('No tasks available')
    })

    it('should not list tasks from a different scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks?scope=${SCOPE_B}`)
      const data = await response.json()

      expect(response.status).toBe(200)
      // Should not contain any scope-A tasks
      data.tasks.forEach((task: any) => {
        expect(task.scope).toBe(SCOPE_B)
      })
    })
  })

  describe('Messages', () => {
    const MSG_SCOPE = `messages-${Date.now()}`
    let taskId: string

    beforeAll(async () => {
      taskId = `test-msg-task-${Date.now()}`
      await fetch(`${baseUrl}/api/v1/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: taskId,
          file_path: `tasks/${taskId}.md`,
          queue: 'incoming',
          branch: 'main',
          scope: MSG_SCOPE,
        }),
      })
    })

    it('should create a message', async () => {
      const response = await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          from_actor: 'orchestrator',
          to_actor: 'agent-1',
          type: 'instruction',
          content: 'Please implement feature X',
          scope: MSG_SCOPE,
        }),
      })

      expect(response.status).toBe(201)
      const data = await response.json() as any
      expect(data.id).toBeDefined()
      expect(data.task_id).toBe(taskId)
      expect(data.from_actor).toBe('orchestrator')
      expect(data.to_actor).toBe('agent-1')
      expect(data.type).toBe('instruction')
      expect(data.content).toBe('Please implement feature X')
      expect(data.scope).toBe(MSG_SCOPE)
      expect(data.created_at).toBeDefined()
    })

    it('should reject message creation without scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          from_actor: 'orchestrator',
          type: 'instruction',
          content: 'No scope message',
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.error).toContain('scope')
    })

    it('should reject message creation without required fields', async () => {
      const response = await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          scope: MSG_SCOPE,
        }),
      })

      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.error).toContain('Missing required fields')
    })

    it('should list messages by task_id', async () => {
      // Create a second message
      await fetch(`${baseUrl}/api/v1/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: taskId,
          from_actor: 'agent-1',
          type: 'status',
          content: 'Working on feature X',
          scope: MSG_SCOPE,
        }),
      })

      const response = await fetch(
        `${baseUrl}/api/v1/messages?task_id=${taskId}&scope=${MSG_SCOPE}`
      )
      expect(response.status).toBe(200)
      const data = await response.json() as any
      expect(data.messages.length).toBeGreaterThanOrEqual(2)
      expect(data.total).toBeGreaterThanOrEqual(2)
      data.messages.forEach((msg: any) => {
        expect(msg.task_id).toBe(taskId)
      })
    })

    it('should list messages by to_actor', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/messages?to_actor=agent-1&scope=${MSG_SCOPE}`
      )
      expect(response.status).toBe(200)
      const data = await response.json() as any
      expect(data.messages.length).toBeGreaterThanOrEqual(1)
      data.messages.forEach((msg: any) => {
        expect(msg.to_actor).toBe('agent-1')
      })
    })

    it('should filter messages by type', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/messages?task_id=${taskId}&type=status&scope=${MSG_SCOPE}`
      )
      expect(response.status).toBe(200)
      const data = await response.json() as any
      expect(data.messages.length).toBeGreaterThanOrEqual(1)
      data.messages.forEach((msg: any) => {
        expect(msg.type).toBe('status')
      })
    })

    it('should reject listing without scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/messages?task_id=${taskId}`)
      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.error).toContain('scope')
    })

    it('should get messages via task sub-resource', async () => {
      const response = await fetch(
        `${baseUrl}/api/v1/tasks/${taskId}/messages?scope=${MSG_SCOPE}`
      )
      expect(response.status).toBe(200)
      const data = await response.json() as any
      expect(data.messages.length).toBeGreaterThanOrEqual(2)
      expect(data.total).toBeGreaterThanOrEqual(2)
      data.messages.forEach((msg: any) => {
        expect(msg.task_id).toBe(taskId)
      })
      // Verify ordered by created_at
      for (let i = 1; i < data.messages.length; i++) {
        expect(data.messages[i].created_at >= data.messages[i - 1].created_at).toBe(true)
      }
    })

    it('should reject task messages listing without scope', async () => {
      const response = await fetch(`${baseUrl}/api/v1/tasks/${taskId}/messages`)
      expect(response.status).toBe(400)
      const data = await response.json() as any
      expect(data.error).toContain('scope')
    })

    it('should enforce scope isolation on messages', async () => {
      const OTHER_SCOPE = `messages-other-${Date.now()}`
      const response = await fetch(
        `${baseUrl}/api/v1/messages?task_id=${taskId}&scope=${OTHER_SCOPE}`
      )
      expect(response.status).toBe(200)
      const data = await response.json() as any
      expect(data.messages.length).toBe(0)
      expect(data.total).toBe(0)
    })
  })
})
