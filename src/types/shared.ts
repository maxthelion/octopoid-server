/**
 * Shared Octopoid types — copied from packages/shared/src/.
 *
 * These types are intentionally duplicated here so the server package is
 * self-contained and can live in its own repository. The canonical source
 * is packages/shared/ in the main octopoid repo. Integration tests in
 * that repo catch drift between the two copies.
 *
 * If you change types here, update packages/shared/ to match (and vice-versa).
 */

// ---------------------------------------------------------------------------
// Task types (from shared/src/task.ts)
// ---------------------------------------------------------------------------

export type TaskQueue =
  | 'incoming'
  | 'claimed'
  | 'provisional'
  | 'done'
  | 'failed'
  | 'rejected'
  | 'escalated'
  | 'recycled'
  | 'breakdown'
  | 'needs_continuation'
  | 'backlog'
  | 'blocked'

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type TaskComplexity = 'XS' | 'S' | 'M' | 'L' | 'XL'

export type TaskRole = 'implement' | 'breakdown' | 'test' | 'review' | 'fix' | 'research'

export interface Task {
  id: string
  file_path: string
  queue: TaskQueue
  priority: TaskPriority
  complexity?: TaskComplexity | null
  role?: TaskRole | null
  branch: string
  blocked_by?: string | null
  claimed_by?: string | null
  claimed_at?: string | null
  commits_count: number
  turns_used?: number | null
  attempt_count: number
  has_plan: boolean
  plan_id?: string | null
  project_id?: string | null
  auto_accept: boolean
  rejection_count: number
  pr_number?: number | null
  pr_url?: string | null
  checks?: string | null
  check_results?: string | null
  needs_rebase: boolean
  last_rebase_attempt_at?: string | null
  staging_url?: string | null
  submitted_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string

  // Client-server fields (v2.0)
  orchestrator_id?: string | null
  lease_expires_at?: string | null
  version: number  // Optimistic locking

  // Task classification
  type?: string | null  // Task type (e.g. "product", "infrastructure", "hotfix")

  // Enhanced features
  needs_breakdown?: boolean | null  // For breakdown agent
  review_round?: number | null      // For multi-check gatekeeper
  execution_notes?: string | null   // Agent execution summary

  // Hook tracking (server-enforced)
  hooks?: string | null  // JSON array of hook objects

  // Declarative flows
  flow?: string | null  // Flow name (e.g. 'default', 'hotfix')
  flow_overrides?: string | null  // JSON object with flow-specific overrides

  // Multi-tenant isolation
  scope?: string | null
}

export interface CreateTaskRequest {
  id: string
  file_path: string
  title?: string
  queue?: TaskQueue
  priority?: TaskPriority
  complexity?: TaskComplexity
  role?: TaskRole
  type?: string
  branch?: string
  blocked_by?: string
  project_id?: string
  auto_accept?: boolean
  hooks?: string  // JSON array of hook objects
  flow?: string  // Flow name
  flow_overrides?: string  // JSON object with flow-specific overrides
  scope?: string
}

export interface UpdateTaskRequest {
  queue?: TaskQueue
  priority?: TaskPriority
  complexity?: TaskComplexity
  role?: TaskRole
  type?: string
  branch?: string
  blocked_by?: string
  claimed_by?: string
  claimed_at?: string
  commits_count?: number
  turns_used?: number
  attempt_count?: number
  has_plan?: boolean
  plan_id?: string
  project_id?: string
  auto_accept?: boolean
  rejection_count?: number
  pr_number?: number
  pr_url?: string
  checks?: string
  check_results?: string
  needs_rebase?: boolean
  last_rebase_attempt_at?: string
  staging_url?: string
  submitted_at?: string
  completed_at?: string
  hooks?: string  // JSON array of hook objects
  flow?: string  // Flow name
  flow_overrides?: string  // JSON object with flow-specific overrides
  version?: number
}

export interface ClaimTaskRequest {
  orchestrator_id: string
  agent_name: string
  role_filter?: TaskRole | TaskRole[]
  type_filter?: string | string[]
  priority_order?: TaskPriority[]
  lease_duration_seconds?: number  // Default: 300 (5 minutes)
  scope?: string
}

export interface SubmitTaskRequest {
  commits_count: number
  turns_used: number
  check_results?: string
  execution_notes?: string
}

export interface AcceptTaskRequest {
  accepted_by: string
  completed_at?: string
}

export interface RejectTaskRequest {
  reason: string
  rejected_by: string
}

export interface TaskFilters {
  queue?: TaskQueue | TaskQueue[]
  priority?: TaskPriority | TaskPriority[]
  role?: TaskRole | TaskRole[]
  claimed_by?: string
  project_id?: string
  has_plan?: boolean
  auto_accept?: boolean
  needs_rebase?: boolean
  scope?: string
}

export interface TaskListResponse {
  tasks: Task[]
  total: number
  offset: number
  limit: number
}

// ---------------------------------------------------------------------------
// Project types (from shared/src/project.ts)
// ---------------------------------------------------------------------------

export type ProjectStatus = 'draft' | 'active' | 'completed' | 'archived'

export interface Project {
  id: string
  title: string
  description?: string | null
  status: ProjectStatus
  branch?: string | null
  base_branch: string
  auto_accept: boolean
  created_at: string
  created_by?: string | null
  completed_at?: string | null
  scope?: string | null
}

export interface CreateProjectRequest {
  id: string
  title: string
  description?: string
  status?: ProjectStatus
  branch?: string
  base_branch?: string
  auto_accept?: boolean
  created_by?: string
  scope?: string
}

export interface UpdateProjectRequest {
  title?: string
  description?: string
  status?: ProjectStatus
  branch?: string
  base_branch?: string
  auto_accept?: boolean
  completed_at?: string
}

export interface ProjectFilters {
  status?: ProjectStatus | ProjectStatus[]
  created_by?: string
  scope?: string
}

export interface ProjectListResponse {
  projects: Project[]
  total: number
  offset: number
  limit: number
}

// ---------------------------------------------------------------------------
// Orchestrator types (from shared/src/orchestrator.ts)
// ---------------------------------------------------------------------------

export type OrchestratorStatus = 'active' | 'offline' | 'maintenance'

export interface OrchestratorCapabilities {
  roles: string[]
  max_agents?: number
  max_concurrent_tasks?: number
  supports_gpu?: boolean
  [key: string]: unknown
}

export interface Orchestrator {
  id: string  // Format: cluster-machine_id
  cluster: string
  machine_id: string
  hostname?: string | null
  repo_url: string
  registered_at: string
  last_heartbeat: string
  status: OrchestratorStatus
  version?: string | null
  capabilities?: OrchestratorCapabilities | null
}

export interface RegisterOrchestratorRequest {
  cluster: string
  machine_id: string
  hostname?: string
  repo_url: string
  version?: string
  capabilities?: OrchestratorCapabilities
}

export interface RegisterOrchestratorResponse {
  orchestrator_id: string
  registered_at: string
  status: OrchestratorStatus
}

export interface HeartbeatRequest {
  timestamp: string
}

export interface HeartbeatResponse {
  success: boolean
  last_heartbeat: string
}

export interface OrchestratorFilters {
  cluster?: string
  status?: OrchestratorStatus | OrchestratorStatus[]
}

export interface OrchestratorListResponse {
  orchestrators: Orchestrator[]
  total: number
}

// ---------------------------------------------------------------------------
// Draft types (from shared/src/draft.ts)
// ---------------------------------------------------------------------------

export type DraftStatus = 'idea' | 'draft' | 'review' | 'approved' | 'implemented' | 'archived'

export interface Draft {
  id: number
  title: string
  status: DraftStatus
  author: string
  domain?: string | null
  file_path?: string | null
  created_at: string
  updated_at: string
  linked_task_id?: string | null
  linked_project_id?: string | null
  tags?: string | null  // JSON string array
  scope?: string | null
}

export interface CreateDraftRequest {
  title: string
  status?: DraftStatus
  author: string
  domain?: string
  file_path?: string
  linked_task_id?: string
  linked_project_id?: string
  tags?: string[]
  scope?: string
}

export interface UpdateDraftRequest {
  title?: string
  status?: DraftStatus
  author?: string
  domain?: string
  file_path?: string
  updated_at?: string
  linked_task_id?: string
  linked_project_id?: string
  tags?: string[]
}

export interface DraftFilters {
  status?: DraftStatus | DraftStatus[]
  author?: string
  domain?: string
  linked_task_id?: string
  linked_project_id?: string
  scope?: string
}

export interface DraftListResponse {
  drafts: Draft[]
  total: number
  offset: number
  limit: number
}

// ---------------------------------------------------------------------------
// Agent types (from shared/src/agent.ts)
// ---------------------------------------------------------------------------

export interface Agent {
  name: string
  role?: string | null
  running: boolean
  pid?: number | null
  current_task_id?: string | null
  last_run_start?: string | null
  last_run_end?: string | null
}

export interface CreateAgentRequest {
  name: string
  role?: string
}

export interface UpdateAgentRequest {
  role?: string
  running?: boolean
  pid?: number
  current_task_id?: string
  last_run_start?: string
  last_run_end?: string
}

export interface AgentListResponse {
  agents: Agent[]
  total: number
}

// ---------------------------------------------------------------------------
// History types (from shared/src/history.ts)
// ---------------------------------------------------------------------------

export type TaskEvent =
  | 'created'
  | 'claimed'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'blocked'
  | 'unblocked'
  | 'requeued'
  | 'archived'

export interface TaskHistory {
  id: number
  task_id: string
  event: TaskEvent
  agent?: string | null
  details?: string | null
  timestamp: string
}

export interface CreateTaskHistoryRequest {
  task_id: string
  event: TaskEvent
  agent?: string
  details?: string
}

export interface TaskHistoryFilters {
  task_id?: string
  event?: TaskEvent | TaskEvent[]
  agent?: string
  since?: string  // ISO timestamp
}

export interface TaskHistoryListResponse {
  history: TaskHistory[]
  total: number
}

// ---------------------------------------------------------------------------
// State machine types (from shared/src/state-machine.ts)
// NOTE: VALID_TRANSITIONS const is NOT copied — the server defines its own
// TRANSITIONS in src/state-machine.ts.
// ---------------------------------------------------------------------------

export interface StateTransitionGuard {
  type: 'dependency_resolved' | 'role_matches' | 'lease_valid' | 'version_matches'
  params?: Record<string, unknown>
}

export interface StateTransitionSideEffect {
  type: 'record_history' | 'unblock_dependents' | 'notify_webhook' | 'update_lease'
  params?: Record<string, unknown>
}

export interface StateTransition {
  from: TaskQueue
  to: TaskQueue
  action: string  // e.g., 'claim', 'submit', 'accept', 'reject'
  guards: StateTransitionGuard[]
  side_effects: StateTransitionSideEffect[]
}

export interface StateTransitionRequest {
  task_id: string
  from: TaskQueue
  to: TaskQueue
  action: string
  params?: Record<string, unknown>
  version?: number  // For optimistic locking
}

export interface StateTransitionResponse {
  success: boolean
  new_state: TaskQueue
  version: number
  errors?: string[]
}

// ---------------------------------------------------------------------------
// API types (from shared/src/api.ts)
// ---------------------------------------------------------------------------

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  version: string
  timestamp: string
  database?: 'connected' | 'disconnected'
}

export interface ErrorResponse {
  error: string
  message: string
  details?: Record<string, unknown>
  timestamp: string
}

export interface PaginationParams {
  offset?: number
  limit?: number
}

export interface SortParams {
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: ErrorResponse
}

export interface BatchOperationRequest<T> {
  operations: T[]
}

export interface BatchOperationResponse {
  succeeded: number
  failed: number
  errors?: Array<{ index: number; error: string }>
}
