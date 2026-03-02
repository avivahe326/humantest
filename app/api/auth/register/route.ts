import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { registerSchema } from '@/lib/validate'
import { RateLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

const registerLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 5 })

export async function POST(request: NextRequest) {
  const ip = getClientIp(request)
  const rateLimit = registerLimiter.check(ip)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit)
  }

  try {
    const body = await request.json()
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { name, email, password } = parsed.data

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const apiKey = crypto.randomBytes(32).toString('hex')

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          apiKey,
          credits: 100,
        },
      })
      await tx.creditTransaction.create({
        data: {
          userId: newUser.id,
          amount: 100,
          type: 'SIGNUP_BONUS',
        },
      })
      return newUser
    })

    return NextResponse.json({ success: true, userId: user.id })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
