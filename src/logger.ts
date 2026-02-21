/**
 * Structured JSON logger for audit trail.
 * Output goes to console (Workers Logpush / wrangler tail).
 */

export interface AuditEntry {
  timestamp: string
  method: string
  path: string
  status: number
  task_id?: string
  agent?: string
  scope?: string
  queue_from?: string
  queue_to?: string
  detail?: string
}

export function audit(entry: AuditEntry): void {
  console.log(JSON.stringify(entry))
}
