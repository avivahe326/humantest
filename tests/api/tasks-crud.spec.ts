import { test, expect, request as playwrightRequest } from '@playwright/test'
import { buildTask, buildFeedback } from '../support/factories'
import { registerUser } from '../support/helpers/auth'

test.describe('Task List @P0 @API', () => {
  test('GET /api/tasks returns paginated results', async ({ request }) => {
    const res = await request.get('/api/tasks')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('tasks')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('page')
    expect(body).toHaveProperty('totalPages')
    expect(Array.isArray(body.tasks)).toBe(true)
    expect(body.page).toBe(1)
  })

  test('GET /api/tasks respects limit param', async ({ request }) => {
    const res = await request.get('/api/tasks?limit=2')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.tasks.length).toBeLessThanOrEqual(2)
  })

  test('GET /api/tasks respects page param', async ({ request }) => {
    const res = await request.get('/api/tasks?page=1&limit=1')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.page).toBe(1)
  })

  test('GET /api/tasks does not require authentication', async ({ request }) => {
    const res = await request.get('/api/tasks')
    expect(res.status()).toBe(200)
  })
})

test.describe('Task Info @P1 @API', () => {
  test('GET /api/tasks/[id]/info returns public task data', async ({ request }) => {
    await registerUser(request)
    const taskData = buildTask()
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    expect(createRes.status()).toBe(200)
    const { taskId } = await createRes.json()

    const res = await request.get(`/api/tasks/${taskId}/info`)
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.title).toBeTruthy()
    expect(body.targetUrl).toBe(taskData.url)
    expect(body.rewardPerTester).toBe(taskData.rewardPerTester)
    expect(body).toHaveProperty('requirements')
  })

  test('GET /api/tasks/[id]/info returns 404 for non-existent task', async ({ request }) => {
    const res = await request.get('/api/tasks/nonexistent-id/info')
    expect(res.status()).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Task not found')
  })
})

test.describe('Task Cancel @P0 @API', () => {
  test('creator can cancel OPEN task and receive refund', async ({ request }) => {
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 3, rewardPerTester: 10 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    const { taskId } = await createRes.json()

    const cancelRes = await request.post(`/api/tasks/${taskId}/cancel`)
    expect(cancelRes.status()).toBe(200)

    const body = await cancelRes.json()
    expect(body.refunded).toBe(30) // 3 * 10, no submissions
    expect(body.newBalance).toBeTruthy()
  })

  test('cancel requires authentication', async ({ request }) => {
    const res = await request.post('/api/tasks/fake-id/cancel')
    expect(res.status()).toBe(401)
  })

  test('cannot cancel already cancelled task', async ({ request }) => {
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 2, rewardPerTester: 5 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    const { taskId } = await createRes.json()

    const cancelRes1 = await request.post(`/api/tasks/${taskId}/cancel`)
    expect(cancelRes1.status()).toBe(200)

    const cancelRes2 = await request.post(`/api/tasks/${taskId}/cancel`)
    expect(cancelRes2.status()).toBe(409)
    const body = await cancelRes2.json()
    expect(body.error).toContain('conflict')
  })

  test('non-creator cannot cancel task', async ({ request }) => {
    // User A creates task
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 2, rewardPerTester: 5 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    const { taskId } = await createRes.json()

    // User B in separate API context
    const userBContext = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    await registerUser(userBContext)

    const cancelRes = await userBContext.post(`/api/tasks/${taskId}/cancel`)
    expect(cancelRes.status()).toBe(403)
    const body = await cancelRes.json()
    expect(body.error).toBe('Not authorized')

    await userBContext.dispose()
  })
})

test.describe('Submit Feedback @P0 @API', () => {
  test('full submit flow: create, claim, submit', async ({ request }) => {
    // User A creates task
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 5, rewardPerTester: 10 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    expect(createRes.status()).toBe(200)
    const { taskId } = await createRes.json()

    // User B claims and submits in separate context
    const userBContext = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    await registerUser(userBContext)

    const claimRes = await userBContext.post(`/api/tasks/${taskId}/claim`)
    expect(claimRes.status()).toBe(200)

    const feedback = buildFeedback()
    const submitRes = await userBContext.post(`/api/tasks/${taskId}/submit`, {
      data: feedback,
    })
    expect(submitRes.status()).toBe(200)

    const body = await submitRes.json()
    expect(body.success).toBe(true)
    expect(body.creditsEarned).toBe(10)
    expect(typeof body.newBalance).toBe('number')

    // Cannot submit again
    const doubleSubmit = await userBContext.post(`/api/tasks/${taskId}/submit`, {
      data: feedback,
    })
    expect(doubleSubmit.status()).toBe(403)

    await userBContext.dispose()
  })
})

test.describe('Submit Feedback - Validation @P1 @API', () => {
  test('submit with invalid data returns 400', async ({ request }) => {
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 5, rewardPerTester: 10 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    const { taskId } = await createRes.json()

    const res = await request.post(`/api/tasks/${taskId}/submit`, {
      data: { rawData: {} },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Validation')
  })

  test('submit requires authentication', async ({ request }) => {
    // Fresh context with no cookies
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const res = await freshCtx.post('/api/tasks/fake-id/submit', {
      data: buildFeedback(),
    })
    expect(res.status()).toBe(401)
    await freshCtx.dispose()
  })
})

test.describe('Generate Report @P0 @API', () => {
  test('generate report requires at least 1 submission', async ({ request }) => {
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 5, rewardPerTester: 10 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    const { taskId } = await createRes.json()

    const reportRes = await request.post(`/api/tasks/${taskId}/generate-report`)
    expect(reportRes.status()).toBe(400)
    const body = await reportRes.json()
    expect(body.error).toContain('submission')
  })

  test('generate report requires authentication', async ({ request }) => {
    const freshCtx = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    const res = await freshCtx.post('/api/tasks/fake-id/generate-report')
    expect(res.status()).toBe(401)
    await freshCtx.dispose()
  })

  test('non-creator cannot generate report', async ({ request }) => {
    // User A creates task
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 2, rewardPerTester: 5 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    const { taskId } = await createRes.json()

    // User B tries
    const userBContext = await playwrightRequest.newContext({
      baseURL: 'http://localhost:3002',
    })
    await registerUser(userBContext)

    const reportRes = await userBContext.post(`/api/tasks/${taskId}/generate-report`)
    expect(reportRes.status()).toBe(403)
    const body = await reportRes.json()
    expect(body.error).toBe('Not authorized')

    await userBContext.dispose()
  })

  test('cannot generate report for cancelled task', async ({ request }) => {
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 2, rewardPerTester: 5 })
    const createRes = await request.post('/api/tasks/create', { data: taskData })
    const { taskId } = await createRes.json()

    await request.post(`/api/tasks/${taskId}/cancel`)

    const reportRes = await request.post(`/api/tasks/${taskId}/generate-report`)
    expect(reportRes.status()).toBe(409)
  })
})
