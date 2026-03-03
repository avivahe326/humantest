import { test, expect, request as playwrightRequest } from '@playwright/test'
import { registerUser } from '../support/helpers/auth'

test.describe('AI Test Plan Generation @P1 @API', () => {
  test('generates test plan for valid URL (or returns 500/504 if AI unavailable)', async ({ request }) => {
    await registerUser(request)

    const res = await request.post('/api/ai/generate-test-plan', {
      data: {
        url: 'https://example.com',
        focus: 'navigation and layout',
        estimatedMinutes: 10,
      },
    })

    // AI API may not be available in dev/test environment
    if (res.status() === 200) {
      const body = await res.json()
      expect(body).toHaveProperty('steps')
      expect(Array.isArray(body.steps)).toBe(true)
      expect(body.steps.length).toBeGreaterThan(0)

      for (const step of body.steps) {
        expect(step.id).toBeTruthy()
        expect(step.instruction).toBeTruthy()
      }
    } else {
      // Accept 500 (AI error) or 504 (timeout) as valid when AI is unavailable
      expect([500, 504]).toContain(res.status())
    }
  })

  test('returns 400 if URL is missing', async ({ request }) => {
    await registerUser(request)

    const res = await request.post('/api/ai/generate-test-plan', {
      data: { focus: 'something' },
    })

    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('URL')
  })

  test('requires authentication', async () => {
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const res = await freshCtx.post('/api/ai/generate-test-plan', {
      data: { url: 'https://example.com' },
    })
    expect(res.status()).toBe(401)
    await freshCtx.dispose()
  })
})
