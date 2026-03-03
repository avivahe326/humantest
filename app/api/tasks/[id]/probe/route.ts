import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { isPrivateUrl, isSafeTargetUrl } from '@/lib/validate'
import { RateLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 })

const MAX_REDIRECTS = 5

function validateUrl(url: string): boolean {
  return isSafeTargetUrl(url) && !isPrivateUrl(url)
}

async function safeFetch(
  url: string,
  method: 'HEAD' | 'GET',
  signal: AbortSignal
): Promise<Response> {
  let currentUrl = url
  let redirectCount = 0

  while (redirectCount < MAX_REDIRECTS) {
    if (!validateUrl(currentUrl)) {
      throw new Error('redirect-to-private')
    }

    const response = await fetch(currentUrl, {
      method,
      redirect: 'manual',
      signal,
    })

    // Follow redirects manually with SSRF check on each hop
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break

      // Resolve relative URLs
      currentUrl = new URL(location, currentUrl).toString()
      redirectCount++
      continue
    }

    return response
  }

  throw new Error('too-many-redirects')
}

function checkFrameHeaders(response: Response): { embeddable: boolean; reason?: string } {
  // Check X-Frame-Options
  const xfo = response.headers.get('x-frame-options')
  if (xfo) {
    const xfoLower = xfo.toLowerCase()
    if (xfoLower === 'deny' || xfoLower === 'sameorigin') {
      return { embeddable: false, reason: 'x-frame-options' }
    }
  }

  // Check Content-Security-Policy frame-ancestors
  const csp = response.headers.get('content-security-policy')
  if (csp) {
    const frameAncestors = csp
      .split(';')
      .map(d => d.trim())
      .find(d => d.toLowerCase().startsWith('frame-ancestors'))

    if (frameAncestors) {
      const value = frameAncestors.toLowerCase()
      if (!value.includes('*') && !value.includes('human-test.work')) {
        return { embeddable: false, reason: 'csp-frame-ancestors' }
      }
    }
  }

  return { embeddable: true }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const ip = getClientIp(request)
  const rl = limiter.check(`probe:${user!.id}:${ip}`)
  if (!rl.allowed) return rateLimitResponse(rl)

  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    select: { targetUrl: true },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const targetUrl = task.targetUrl

  // SSRF protection: block private/internal URLs
  if (!validateUrl(targetUrl)) {
    return NextResponse.json({ embeddable: false, reason: 'invalid-url' })
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    let response: Response
    try {
      response = await safeFetch(targetUrl, 'HEAD', controller.signal)
    } finally {
      clearTimeout(timeout)
    }

    // Handle 405 Method Not Allowed: fallback to GET with same SSRF checks
    if (response.status === 405) {
      const getController = new AbortController()
      const getTimeout = setTimeout(() => getController.abort(), 5000)
      try {
        response = await safeFetch(targetUrl, 'GET', getController.signal)
        // Cancel response body immediately to prevent memory exhaustion (F3)
        response.body?.cancel().catch(() => {})
      } finally {
        clearTimeout(getTimeout)
      }
    }

    return NextResponse.json(checkFrameHeaders(response))
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (msg === 'redirect-to-private') {
      return NextResponse.json({ embeddable: false, reason: 'redirect-to-private' })
    }
    return NextResponse.json({ embeddable: false, reason: 'unreachable' })
  }
}
