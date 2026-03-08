import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/require-api-key'
import { createTaskSchema, isSafeTargetUrl, isValidRepoUrl } from '@/lib/validate'
import { generateTestPlan } from '@/lib/ai-test-plan'
import { prisma } from '@/lib/prisma'
import { withCors, corsOptionsResponse } from '@/lib/cors'
import { RateLimiter, rateLimitResponse } from '@/lib/rate-limit'
import { getConfig } from '@/lib/settings'

const skillApiLimiter = new RateLimiter({ windowMs: 60_000, maxRequests: 30 })

export async function OPTIONS() {
  return corsOptionsResponse()
}

export async function POST(request: NextRequest) {
  const { user, error } = await requireApiKey(request, { optional: true })
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

    // Determine task creator: explicit `creator` field, or the authenticated user
    let creatorId = user!.id
    if (body.creator && typeof body.creator === 'string') {
      const creatorName = body.creator.trim()
      if (creatorName) {
        let creatorUser = await prisma.user.findFirst({ where: { name: creatorName } })
        if (!creatorUser) {
          const { randomBytes } = await import('crypto')
          const bcrypt = await import('bcryptjs')
          creatorUser = await prisma.user.create({
            data: {
              name: creatorName,
              email: `${creatorName.toLowerCase().replace(/[^a-z0-9]/g, '')}@humantest.local`,
              password: await bcrypt.hash(randomBytes(16).toString('hex'), 10),
              apiKey: randomBytes(32).toString('hex'),
            },
          })
        }
        creatorId = creatorUser.id
      }
    }

    if (!isSafeTargetUrl(data.url)) {
      return withCors(NextResponse.json({ error: 'Invalid URL. Only http and https URLs are allowed.' }, { status: 400 }))
    }

    if (data.repoUrl && !isValidRepoUrl(data.repoUrl)) {
      return withCors(NextResponse.json({ error: 'Invalid repo URL. Only GitHub and Gitee HTTPS URLs are supported.' }, { status: 400 }))
    }

    // Derive locale from body or Accept-Language header or default setting
    const defaultLocale = await getConfig('DEFAULT_LOCALE') || undefined
    const locale = data.locale || (
      /^zh/i.test(request.headers.get('accept-language') || '') ? 'zh' : defaultLocale
    )

    const maxTesters = data.maxTesters ?? parseInt(await getConfig('DEFAULT_MAX_TESTERS') || '5')
    const estimatedMinutes = data.estimatedMinutes ?? parseInt(await getConfig('DEFAULT_ESTIMATED_MINUTES') || '10')

    let requirements = data.requirements
    if (!requirements) {
      try {
        requirements = await generateTestPlan(data.url, data.focus, estimatedMinutes, undefined, locale)
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
        estimatedMinutes,
        locale,
        webhookUrl: data.webhookUrl,
        codeFixWebhookUrl: data.codeFixWebhookUrl,
        repoUrl: data.repoUrl,
        repoBranch: data.repoBranch,
        creatorId,
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
