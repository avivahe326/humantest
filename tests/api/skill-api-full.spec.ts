import { test, expect, request as playwrightRequest } from '@playwright/test'
import { buildUser } from '../support/factories'
import { registerUser } from '../support/helpers/auth'

/** Inline register (no login, returns apiKey) for Skill API tests */
async function registerAndGetApiKey(
  request: ReturnType<typeof playwrightRequest.newContext> extends Promise<infer R> ? R : never,
) {
  const user = await registerUser(request)
  const historyRes = await request.get('/api/credits/history')
  const { apiKey } = await historyRes.json()
  return { user, apiKey }
}

test.describe('Skill API - Full Flow @P0 @API', () => {
  let apiKey: string

  test.describe.configure({ mode: 'serial' })

  test('setup: register user and get API key', async ({ request }) => {
    const { apiKey: key } = await registerAndGetApiKey(request)
    apiKey = key
    expect(apiKey).toBeTruthy()
  })

  let taskId: string

  test('create task via Skill API with valid API key', async ({ request }) => {
    const res = await request.post('/api/skill/human-test', {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {
        url: 'https://example.com',
        title: 'Skill API Test Task',
        maxTesters: 2,
        rewardPerTester: 5,
      },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.taskId).toBeTruthy()
    expect(body.status).toBe('OPEN')
    taskId = body.taskId
  })

  test('check task status via Skill API', async ({ request }) => {
    const res = await request.get(`/api/skill/status/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.taskId).toBe(taskId)
    expect(body.status).toBe('OPEN')
    expect(body.title).toBe('Skill API Test Task')
    expect(body.maxTesters).toBe(2)
    expect(body.claimedCount).toBe(0)
    expect(body.submittedCount).toBe(0)
    expect(body.report).toBeNull()
  })

  test('Skill API status has CORS headers', async ({ request }) => {
    const res = await request.get(`/api/skill/status/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    expect(res.headers()['access-control-allow-origin']).toBe('*')
  })
})

test.describe('Skill API - Error Cases @P1 @API', () => {
  test('create task with insufficient credits returns 402', async ({ request }) => {
    const { apiKey } = await registerAndGetApiKey(request)

    const res = await request.post('/api/skill/human-test', {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: {
        url: 'https://example.com',
        maxTesters: 50,
        rewardPerTester: 100,
      },
    })

    expect(res.status()).toBe(402)
    const body = await res.json()
    expect(body.error).toContain('Insufficient')
  })

  test('create task with invalid URL returns 400', async ({ request }) => {
    const { apiKey } = await registerAndGetApiKey(request)

    const res = await request.post('/api/skill/human-test', {
      headers: { Authorization: `Bearer ${apiKey}` },
      data: { url: 'not-a-valid-url' },
    })

    expect(res.status()).toBe(400)
  })

  test('status returns 404 for non-existent task', async ({ request }) => {
    const { apiKey } = await registerAndGetApiKey(request)

    const res = await request.get('/api/skill/status/nonexistent-id', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    expect(res.status()).toBe(404)
  })

  test('status returns 403 for task not owned by user', async ({ request }) => {
    // User A creates task
    const { apiKey: apiKeyA } = await registerAndGetApiKey(request)

    const createRes = await request.post('/api/skill/human-test', {
      headers: { Authorization: `Bearer ${apiKeyA}` },
      data: { url: 'https://example.com', maxTesters: 1, rewardPerTester: 5 },
    })
    const { taskId } = await createRes.json()

    // User B in separate context
    const userBContext = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const { apiKey: apiKeyB } = await registerAndGetApiKey(userBContext)

    const res = await userBContext.get(`/api/skill/status/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKeyB}` },
    })

    expect(res.status()).toBe(403)
    await userBContext.dispose()
  })
})
