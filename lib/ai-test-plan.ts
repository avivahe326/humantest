import { chat } from '@/lib/ai-client'
import { getLanguageInstruction } from '@/lib/ai-locale'

export interface TestStep {
  id: string
  instruction: string
  type: string
}

export interface TestPlan {
  steps: TestStep[]
  nps: boolean
  estimatedMinutes: number
}

export async function generateTestPlan(
  url: string,
  focus?: string,
  estimatedMinutes?: number,
  timeoutMs: number = 30000,
  locale?: string,
): Promise<TestPlan> {
  const minutes = estimatedMinutes || 10

  const response = await chat(
    [
      {
        role: 'user',
        content: `Generate a structured usability test plan for ${url}.${focus ? ` Focus: ${focus}.` : ''} Duration: ~${minutes} min. Return JSON: {"steps": [{"id": "step_1", "instruction": "...", "type": "open_text"}, ...], "nps": true, "estimatedMinutes": ${minutes}}. Steps should be specific actions a tester should take on the product. Generate 3-7 steps depending on complexity. Respond with JSON only.`,
      },
    ],
    {
      system: 'You are a UX research expert. Generate structured usability test plans. Always respond with valid JSON only, no markdown wrapping.' + getLanguageInstruction(locale),
      maxTokens: 1024,
      temperature: 0.7,
      timeoutMs,
      maxRetries: 0,
    }
  )

  try {
    // Strip potential markdown code fences
    const jsonStr = response.text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(jsonStr) as TestPlan
    if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return defaultTestPlan(minutes, locale)
    }
    return parsed
  } catch {
    return defaultTestPlan(minutes)
  }
}

function defaultTestPlan(minutes: number, locale?: string): TestPlan {
  if (locale === 'zh') {
    return {
      steps: [
        { id: 'step_1', instruction: '打开产品，描述你的第一印象', type: 'open_text' },
        { id: 'step_2', instruction: '浏览主要功能', type: 'open_text' },
        { id: 'step_3', instruction: '尝试完成主要操作或任务', type: 'open_text' },
        { id: 'step_4', instruction: '记录任何令人困惑或意外的地方', type: 'open_text' },
      ],
      nps: true,
      estimatedMinutes: minutes,
    }
  }
  return {
    steps: [
      { id: 'step_1', instruction: 'Open the product and describe your first impression', type: 'open_text' },
      { id: 'step_2', instruction: 'Navigate through the main features', type: 'open_text' },
      { id: 'step_3', instruction: 'Try to complete the primary action or task', type: 'open_text' },
      { id: 'step_4', instruction: 'Note anything confusing or unexpected', type: 'open_text' },
    ],
    nps: true,
    estimatedMinutes: minutes,
  }
}
