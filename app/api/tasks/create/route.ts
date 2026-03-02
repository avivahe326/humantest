import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { createTaskSchema, isSafeTargetUrl } from '@/lib/validate'
import { spendCredits } from '@/lib/credits'
import { generateTestPlan } from '@/lib/ai-test-plan'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth()
  if (error) return error

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

    const maxTesters = data.maxTesters ?? 5
    const rewardPerTester = data.rewardPerTester ?? 20
    const totalCost = maxTesters * rewardPerTester

    try {
      await spendCredits(user!.id, totalCost, 'TASK_CREATION')
    } catch {
      return NextResponse.json({ error: 'Insufficient credits', balance: 0 }, { status: 402 })
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
        creatorId: user!.id,
      },
    })

    return NextResponse.json({ taskId: task.id })
  } catch (err) {
    console.error('Task creation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
