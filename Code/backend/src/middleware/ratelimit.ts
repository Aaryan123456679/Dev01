import { createMiddleware } from 'hono/factory'
import { QuotaError } from '../types/common'
import type { HonoEnv } from '../types/common'

interface Bucket {
  tokens: number
  lastRefill: number
}

// In-memory token bucket per user — suitable for POC single-instance deployment.
// Replace with Redis (ioredis) for multi-instance production use.
const buckets = new Map<string, Bucket>()

const MAX_TOKENS = parseInt(process.env.RATE_LIMIT_MAX ?? '60', 10)
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10)
const REFILL_RATE = MAX_TOKENS / WINDOW_MS

function getBucket(key: string): Bucket {
  if (!buckets.has(key)) {
    buckets.set(key, { tokens: MAX_TOKENS, lastRefill: Date.now() })
  }
  return buckets.get(key)!
}

function consume(key: string): boolean {
  const now = Date.now()
  const bucket = getBucket(key)
  const elapsed = now - bucket.lastRefill
  bucket.tokens = Math.min(MAX_TOKENS, bucket.tokens + elapsed * REFILL_RATE)
  bucket.lastRefill = now

  if (bucket.tokens < 1) return false
  bucket.tokens -= 1
  return true
}

export const rateLimitMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  const { userId } = c.get('tenantCtx')
  if (!consume(userId)) {
    c.header('Retry-After', String(Math.ceil(WINDOW_MS / 1000)))
    throw new QuotaError('Rate limit exceeded — too many requests')
  }
  await next()
})
