/**
 * Authentication middleware — scope-scoped API keys
 *
 * Extracts Bearer token from Authorization header, hashes it,
 * looks up the associated scope in api_keys table, and sets
 * the authenticated scope on the Hono context.
 *
 * If no Authorization header: no-op (unauthenticated, existing behavior).
 * If header present but invalid: 401.
 */

import { createMiddleware } from 'hono/factory'
import type { Env, AppVariables } from '../index'
import { queryOne, execute } from '../database'

/** SHA-256 hash a string, return hex */
export async function hashKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Generate a random API key with oct_ prefix */
export function generateApiKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `oct_${hex}`
}

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: AppVariables }>(async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader) {
    // No enforcement yet — unauthenticated requests pass through even for
    // scopes that have keys. A future phase will flip this to require auth.
    await next()
    return
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return c.json({ error: 'Invalid Authorization header. Expected: Bearer <api_key>' }, 401)
  }

  const token = match[1]
  if (!token.startsWith('oct_')) {
    return c.json({ error: 'Invalid API key format. Keys must start with oct_' }, 401)
  }

  const keyHash = await hashKey(token)
  const db = c.env.DB

  const row = await queryOne<{ scope: string }>(
    db,
    'SELECT scope FROM api_keys WHERE key_hash = ?',
    keyHash
  )

  if (!row) {
    return c.json({ error: 'Invalid API key' }, 401)
  }

  // Set authenticated scope on context
  c.set('authScope', row.scope)

  // Check scope mismatch — query param
  const scopeParam = new URL(c.req.url).searchParams.get('scope')
  if (scopeParam && scopeParam !== row.scope) {
    return c.json({ error: `Scope mismatch: authenticated as "${row.scope}" but requested "${scopeParam}"` }, 403)
  }

  // Check scope mismatch — request body (for POST/PATCH/PUT with scope in body)
  if (['POST', 'PATCH', 'PUT'].includes(c.req.method)) {
    try {
      const cloned = c.req.raw.clone()
      const body = await cloned.json() as Record<string, unknown>
      if (body?.scope && body.scope !== row.scope) {
        return c.json({ error: `Scope mismatch: authenticated as "${row.scope}" but requested "${body.scope}"` }, 403)
      }
    } catch {
      // No JSON body or parse error — that's fine, skip body check
    }
  }

  // Update last_used_at (fire and forget)
  execute(
    db,
    'UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE key_hash = ?',
    keyHash
  ).catch(() => {})

  await next()
  return
})

/**
 * Get the authenticated scope from context, or null if unauthenticated.
 */
export function getAuthenticatedScope(c: any): string | null {
  return c.get('authScope') || null
}

/**
 * Resolve the scope for a request. Checks:
 * 1. Authenticated scope from API key (takes precedence)
 * 2. Falls back to scope query parameter or body field
 *
 * Scope mismatch between auth and request returns 403.
 * No enforcement for unauthenticated requests (phase 2).
 */
export async function resolveScope(
  c: any,
  requestedScope: string | undefined
): Promise<{ scope: string } | { error: string; status: number }> {
  const authScope = getAuthenticatedScope(c)

  if (authScope) {
    if (requestedScope && requestedScope !== authScope) {
      return { error: `Scope mismatch: authenticated as "${authScope}" but requested "${requestedScope}"`, status: 403 }
    }
    return { scope: authScope }
  }

  // Unauthenticated — no enforcement yet, just use requested scope
  if (requestedScope) {
    return { scope: requestedScope }
  }

  return { error: 'Missing scope', status: 400 }
}
