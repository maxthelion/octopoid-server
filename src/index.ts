/**
 * Octopoid Server - Cloudflare Workers API
 * Main entry point for the Hono application
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { D1Database } from '@cloudflare/workers-types'
import type { HealthCheckResponse } from './types/shared.js'

import { getConfig } from './config'
import { healthCheck as dbHealthCheck } from './database'

// Environment bindings
export interface Env {
  DB: D1Database
  ANTHROPIC_API_KEY?: string  // Optional, for future server-side features
  API_SECRET_KEY?: string     // For admin endpoints
}

// Create Hono app with typed environment
const app = new Hono<{ Bindings: Env }>()

// Middleware
app.use('/*', cors())

// Health check endpoint
app.get('/api/health', async (c) => {
  const db = c.env.DB
  const config = getConfig()

  const dbConnected = await dbHealthCheck(db)

  const response: HealthCheckResponse = {
    status: dbConnected ? 'healthy' : 'unhealthy',
    version: config.version,
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
  }

  const statusCode = dbConnected ? 200 : 503
  return c.json(response, statusCode)
})

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Octopoid Server',
    version: getConfig().version,
    endpoints: [
      'GET  /api/health',
      'POST /api/v1/orchestrators/register',
      'POST /api/v1/orchestrators/:id/heartbeat',
      'GET  /api/v1/orchestrators',
      'GET    /api/v1/tasks',
      'POST   /api/v1/tasks',
      'GET    /api/v1/tasks/:id',
      'PATCH  /api/v1/tasks/:id',
      'DELETE /api/v1/tasks/:id',
      'POST   /api/v1/tasks/claim',
      'POST /api/v1/tasks/:id/submit',
      'POST /api/v1/tasks/:id/accept',
      'POST /api/v1/tasks/:id/reject',
      'POST /api/v1/tasks/:id/requeue',
      'GET  /api/v1/drafts',
      'POST /api/v1/drafts',
      'GET  /api/v1/drafts/:id',
      'PATCH /api/v1/drafts/:id',
      'DELETE /api/v1/drafts/:id',
      'POST /api/v1/roles/register',
      'GET  /api/v1/roles',
      'GET  /api/v1/roles/:name',
      'GET  /api/v1/projects',
      'POST /api/v1/projects',
      'GET  /api/v1/projects/:id',
      'GET  /api/v1/projects/:id/tasks',
      'PATCH /api/v1/projects/:id',
      'DELETE /api/v1/projects/:id',
      'GET  /api/v1/scheduler/poll',
      'PUT  /api/v1/flows/:name',
      'GET  /api/v1/flows',
      'GET  /api/v1/flows/:name',
      'POST /api/v1/messages',
      'GET  /api/v1/messages',
      'GET  /api/v1/tasks/:id/messages',
      'POST /api/v1/actions',
      'GET  /api/v1/actions',
      'POST /api/v1/actions/:id/execute',
      'PATCH /api/v1/actions/:id',
    ],
  })
})

// Mount route modules
import { tasksRoute } from './routes/tasks'
import { orchestratorsRoute } from './routes/orchestrators'
import { draftsRoute } from './routes/drafts'
import { projectsRoute } from './routes/projects'
import { rolesRoute } from './routes/roles'
import { schedulerRoute } from './routes/scheduler'
import { flowsRoute } from './routes/flows'
import { messagesRoute } from './routes/messages'
import { actionsRoute } from './routes/actions'
app.route('/api/v1/tasks', tasksRoute)
app.route('/api/v1/orchestrators', orchestratorsRoute)
app.route('/api/v1/drafts', draftsRoute)
app.route('/api/v1/projects', projectsRoute)
app.route('/api/v1/roles', rolesRoute)
app.route('/api/v1/scheduler', schedulerRoute)
app.route('/api/v1/flows', flowsRoute)
app.route('/api/v1/messages', messagesRoute)
app.route('/api/v1/actions', actionsRoute)

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Endpoint ${c.req.url} not found`,
      timestamp: new Date().toISOString(),
    },
    404
  )
})

// Error handler
app.onError((err, c) => {
  console.error('Server error:', err)
  return c.json(
    {
      error: 'Internal Server Error',
      message: err.message,
      timestamp: new Date().toISOString(),
    },
    500
  )
})

// Export for Cloudflare Workers
export default {
  fetch: app.fetch,

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    console.log('Scheduled job triggered at:', new Date().toISOString())

    const { runLeaseMonitor } = await import('./scheduled/lease-monitor')
    await runLeaseMonitor(env.DB)
  },
}
