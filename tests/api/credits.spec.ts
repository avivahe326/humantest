import { test, expect, request as playwrightRequest } from '@playwright/test'
import { registerUser } from '../support/helpers/auth'

test.describe('Credits Balance @P0 @API', () => {
  test('new user has 100 credits', async ({ request }) => {
    await registerUser(request)

    const res = await request.get('/api/credits/balance')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.credits).toBe(100)
  })

  test('balance requires authentication', async () => {
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const res = await freshCtx.get('/api/credits/balance')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
    await freshCtx.dispose()
  })
})

test.describe('Credits History @P1 @API', () => {
  test('new user has SIGNUP_BONUS transaction', async ({ request }) => {
    await registerUser(request)

    const res = await request.get('/api/credits/history')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.credits).toBe(100)
    expect(body.apiKey).toBeTruthy()
    expect(Array.isArray(body.transactions)).toBe(true)
    expect(body.transactions.length).toBeGreaterThanOrEqual(1)

    const bonus = body.transactions.find(
      (t: { type: string }) => t.type === 'SIGNUP_BONUS'
    )
    expect(bonus).toBeTruthy()
    expect(bonus.amount).toBe(100)
  })

  test('history returns transactions in descending order', async ({ request }) => {
    await registerUser(request)

    const res = await request.get('/api/credits/history')
    const body = await res.json()

    if (body.transactions.length > 1) {
      const dates = body.transactions.map((t: { createdAt: string }) =>
        new Date(t.createdAt).getTime()
      )
      for (let i = 0; i < dates.length - 1; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1])
      }
    }
  })

  test('history requires authentication', async () => {
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const res = await freshCtx.get('/api/credits/history')
    expect(res.status()).toBe(401)
    await freshCtx.dispose()
  })
})
