import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      console.error('Test plan generation timeout')
      return NextResponse.json({ error: 'AI test plan generation timed out, please try again' }, { status: 504 })
    }
    console.error('Test plan generation error:', err)
    return NextResponse.json({ error: 'Failed to generate test plan' }, { status: 500 })
  }
}
