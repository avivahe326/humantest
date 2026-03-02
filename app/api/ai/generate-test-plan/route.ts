import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { generateTestPlan } from '@/lib/ai-test-plan'

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth()
  if (error) return error

  try {
    const body = await request.json()
    const { url, focus, estimatedMinutes } = body

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    const plan = await generateTestPlan(url, focus, estimatedMinutes)
    return NextResponse.json(plan)
  } catch (err) {
    console.error('Test plan generation error:', err)
    return NextResponse.json({ error: 'Failed to generate test plan' }, { status: 500 })
  }
}
