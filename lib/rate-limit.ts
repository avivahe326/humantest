import { NextRequest, NextResponse } from 'next/server'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfter: number
}

const globalStore = globalThis as Record<string, unknown>
const allLimiters: RateLimiter[] = (globalStore.__rateLimiters as RateLimiter[]) ?? []
globalStore.__rateLimiters = allLimiters

if (!globalStore.__rateLimitCleanup) {
  const timer = setInterval(() => {
    const now = Date.now()
    for (const limiter of allLimiters) {
      limiter.cleanup(now)
    }
  }, 60_000)
  timer.unref()
  globalStore.__rateLimitCleanup = timer
}

export class RateLimiter {
  private store = new Map<string, number[]>()
  private windowMs: number
  private maxRequests: number

  constructor({ windowMs, maxRequests }: { windowMs: number; maxRequests: number }) {
    this.windowMs = windowMs
    this.maxRequests = maxRequests
    allLimiters.push(this)
  }

  check(key: string): RateLimitResult {
    const now = Date.now()
    const cutoff = now - this.windowMs
    const timestamps = (this.store.get(key) ?? []).filter((t) => t > cutoff)
    this.store.set(key, timestamps)

    if (timestamps.length < this.maxRequests) {
      timestamps.push(now)
      return { allowed: true, remaining: this.maxRequests - timestamps.length, retryAfter: 0 }
    }

    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((timestamps[0] + this.windowMs - now) / 1000)),
    }
  }

  cleanup(now: number) {
    const cutoff = now - this.windowMs
    for (const [key, timestamps] of this.store) {
      const valid = timestamps.filter((t) => t > cutoff)
      if (valid.length === 0) {
        this.store.delete(key)
      } else {
        this.store.set(key, valid)
      }
    }
  }
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0].trim()
    if (first) return first
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return 'unknown'
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests, please try again later' },
    { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
  )
}
