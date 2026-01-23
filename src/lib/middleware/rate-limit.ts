interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory store for rate limiting
// In production, use Redis or similar for distributed systems
const rateLimitStore = new Map<string, RateLimitEntry>()

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let cleanupTimer: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupTimer) return

  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)

  // Don't prevent process from exiting
  cleanupTimer.unref()
}

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
  retryAfterSeconds?: number
}

/**
 * Check if a request is allowed under rate limiting.
 * @param key - Unique identifier for the rate limit (e.g., IP + endpoint)
 * @param config - Rate limit configuration
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  startCleanup()

  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // If no entry or entry has expired, create a new one
  if (!entry || entry.resetTime < now) {
    const resetTime = now + config.windowMs
    rateLimitStore.set(key, { count: 1, resetTime })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetTime,
    }
  }

  // Entry exists and is still valid
  if (entry.count >= config.maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetTime - now) / 1000)
    return {
      allowed: false,
      remaining: 0,
      resetTime: entry.resetTime,
      retryAfterSeconds,
    }
  }

  // Increment count
  entry.count++
  rateLimitStore.set(key, entry)

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  }
}

// Preset configurations for different endpoints
export const RATE_LIMITS = {
  chat: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 20 requests per minute
  },
  checkout: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 10 requests per hour
  },
} as const

/**
 * Get client IP from request headers.
 * Handles common proxy headers.
 */
export function getClientIp(request: Request): string {
  // Check common proxy headers
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Take the first IP in the list (client's IP)
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // Fallback for direct connections
  return 'unknown'
}

/**
 * Create a rate limit key for a specific endpoint.
 */
export function createRateLimitKey(ip: string, endpoint: string): string {
  return `${endpoint}:${ip}`
}
