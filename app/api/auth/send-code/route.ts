import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendCodeSchema } from '@/lib/validate'
import { sendVerificationCode } from '@/lib/email'
import { RateLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const ipLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 3 })
const emailLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 1 })

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const ipLimit = ipLimiter.check(ip)
  if (!ipLimit.allowed) {
    return rateLimitResponse(ipLimit)
  }

  try {
    const body = await request.json()
    const parsed = sendCodeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { email } = parsed.data

    // Per-email rate limit: 1 code per 60 seconds
    const emailLimit = emailLimiter.check(email)
    if (!emailLimit.allowed) {
      return NextResponse.json(
        { error: 'Please wait before requesting another code', retryAfter: emailLimit.retryAfter },
        { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfter) } }
      )
    }

    // Check if email is already registered
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    // Generate 6-digit code
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Store code in DB (delete old ones first, cleanup expired)
    await prisma.$transaction([
      prisma.emailVerificationCode.deleteMany({ where: { email } }),
      prisma.emailVerificationCode.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      prisma.emailVerificationCode.create({ data: { email, code, expiresAt } }),
    ])

    // Send email
    await sendVerificationCode(email, code)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send code error:', error)
    return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 })
  }
}
