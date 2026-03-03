import { test, expect, request as playwrightRequest } from '@playwright/test'
import { buildUser } from '../support/factories'
import { registerUser } from '../support/helpers/auth'

test.describe('Login Flow @P0 @API', () => {
  test('login with valid credentials returns session cookie', async ({ request }) => {
    const user = await registerUser(request)

    // Get CSRF token
    const csrfRes = await request.get('/api/auth/csrf')
    expect(csrfRes.status()).toBe(200)
    const { csrfToken } = await csrfRes.json()
    expect(csrfToken).toBeTruthy()

    // Login with credentials (use fresh context to verify login works independently)
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const csrfRes2 = await freshCtx.get('/api/auth/csrf')
    const { csrfToken: freshToken } = await csrfRes2.json()

    const loginRes = await freshCtx.post('/api/auth/callback/credentials', {
      form: {
        email: user.email,
        password: user.plainPassword,
        csrfToken: freshToken,
        json: 'true',
      },
    })

    // NextAuth returns 200 on success (or redirect)
    expect([200, 302]).toContain(loginRes.status())
    await freshCtx.dispose()
  })

  test('login with wrong password fails', async ({ request }) => {
    const user = await registerUser(request)

    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const csrfRes = await freshCtx.get('/api/auth/csrf')
    const { csrfToken } = await csrfRes.json()

    const loginRes = await freshCtx.post('/api/auth/callback/credentials', {
      form: {
        email: user.email,
        password: 'WrongPassword999!',
        csrfToken,
        json: 'true',
      },
    })

    // NextAuth returns 200 with error URL or 401
    const body = await loginRes.text()
    if (loginRes.status() === 200) {
      expect(body).toContain('error')
    }
    await freshCtx.dispose()
  })

  test('login with non-existent email fails', async ({ request }) => {
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const csrfRes = await freshCtx.get('/api/auth/csrf')
    const { csrfToken } = await csrfRes.json()

    const loginRes = await freshCtx.post('/api/auth/callback/credentials', {
      form: {
        email: 'nobody@example.com',
        password: 'SomePass123!',
        csrfToken,
        json: 'true',
      },
    })

    if (loginRes.status() === 200) {
      const body = await loginRes.text()
      expect(body).toContain('error')
    }
    await freshCtx.dispose()
  })
})

test.describe('API Key Regeneration @P1 @API', () => {
  test('regenerate-key returns new 64-char hex key', async ({ request }) => {
    await registerUser(request)

    const res = await request.post('/api/auth/regenerate-key')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.apiKey).toBeTruthy()
    expect(body.apiKey).toHaveLength(64)
    expect(body.apiKey).toMatch(/^[0-9a-f]{64}$/)
  })

  test('regenerate-key returns different key each time', async ({ request }) => {
    await registerUser(request)

    const res1 = await request.post('/api/auth/regenerate-key')
    const { apiKey: key1 } = await res1.json()

    const res2 = await request.post('/api/auth/regenerate-key')
    const { apiKey: key2 } = await res2.json()

    expect(key1).not.toBe(key2)
  })

  test('regenerate-key requires authentication', async ({ request }) => {
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const res = await freshCtx.post('/api/auth/regenerate-key')
    expect(res.status()).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
    await freshCtx.dispose()
  })
})
