import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { createTaskSchema, isSafeTargetUrl, isValidRepoUrl } from '@/lib/validate'
import { generateTestPlan } from '@/lib/ai-test-plan'
import { prisma } from '@/lib/prisma'
import { RateLimiter, rateLimitResponse } from '@/lib/rate-limit'

const createTaskLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 })

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth()
  if (error) return error

  const rateLimit = createTaskLimiter.check(user!.id)
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit)
  }

  try {
    const body = await request.json()
    const parsed = createTaskSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const data = parsed.data
    if (!isSafeTargetUrl(data.url)) {
      return NextResponse.json({ error: 'Invalid URL. Only http and https URLs are allowed.' }, { status: 400 })
    }

    if (data.repoUrl && !isValidRepoUrl(data.repoUrl)) {
      return NextResponse.json({ error: 'Invalid repo URL. Only GitHub and Gitee HTTPS URLs are supported.' }, { status: 400 })
    }

    const maxTesters = data.maxTesters ?? 5

    let requirements = data.requirements
    if (!requirements) {
      try {
        requirements = await generateTestPlan(data.url, data.focus, data.estimatedMinutes, undefined, data.locale)
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
        estimatedMinutes: data.estimatedMinutes ?? 10,
        locale: data.locale,
        repoUrl: data.repoUrl,
        repoBranch: data.repoBranch,
        creatorId: user!.id,
      },
    })

    return NextResponse.json({ taskId: task.id })
  } catch (err) {
    console.error('Task creation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
