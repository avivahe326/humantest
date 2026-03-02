import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/require-api-key'
import { createTaskSchema, isSafeTargetUrl } from '@/lib/validate'
import { spendCredits } from '@/lib/credits'
import { generateTestPlan } from '@/lib/ai-test-plan'
import { prisma } from '@/lib/prisma'
import { withCors, corsOptionsResponse } from '@/lib/cors'
import { RateLimiter, rateLimitResponse } from '@/lib/rate-limit'

const skillApiLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 30 })

export async function OPTIONS() {
  return corsOptionsResponse()
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireApiKey(request)
  if (error) return withCors(error)

  const rateLimit = skillApiLimiter.check(user!.id)
  if (!rateLimit.allowed) {
    return withCors(rateLimitResponse(rateLimit))
  }

  try {
    const body = await request.json()
    const parsed = createTaskSchema.safeParse(body)
    if (!parsed.success) {
      return withCors(NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 }))
    }

    const data = parsed.data
    if (!isSafeTargetUrl(data.url)) {
      return withCors(NextResponse.json({ error: 'Invalid URL. Only http and https URLs are allowed.' }, { status: 400 }))
    }

    const maxTesters = data.maxTesters ?? 5
    const rewardPerTester = data.rewardPerTester ?? 20
    const totalCost = maxTesters * rewardPerTester

    try {
      await spendCredits(user!.id, totalCost, 'TASK_CREATION')
    } catch {
      return withCors(NextResponse.json({ error: 'Insufficient credits', balance: user!.credits }, { status: 402 }))
    }

    let requirements = data.requirements
    if (!requirements) {
      try {
        requirements = await generateTestPlan(data.url, data.focus, data.estimatedMinutes)
      } catch {
        // Fallback: task created without auto-generated plan
      }
    }

    let title = data.title
    if (!title) {
      try {
        const hostname = new URL(data.url).hostname
        title = `Test: ${hostname}`
      } catch {
        title = 'Untitled Test'
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: data.description,
        targetUrl: data.url,
        focus: data.focus,
        requirements: requirements ?? undefined,
        maxTesters,
        rewardPerTester,
        estimatedMinutes: data.estimatedMinutes ?? 10,
        webhookUrl: data.webhookUrl,
        creatorId: user!.id,
      },
    })

    return withCors(NextResponse.json({
      taskId: task.id,
      status: 'OPEN',
      testPlan: requirements,
    }))
  } catch (err) {
    console.error('Skill API task creation error:', err)
    return withCors(NextResponse.json({ error: 'Internal server error' }, { status: 500 }))
  }
}
