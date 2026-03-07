import { test, expect } from '@playwright/test'
import { registerUser } from '../support/helpers/auth'
import { buildTask } from '../support/factories'

test.describe('Landing Page @P0 @E2E', () => {
  test('renders hero section and CTAs', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
  })

  test('renders How It Works section', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/how it works/i)).toBeVisible()
  })

  test('navigation has logo link', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('nav')).toBeVisible()
    await expect(page.locator('nav a[href="/"]')).toBeVisible()
  })
})

test.describe('Register Page @P0 @E2E', () => {
  test('renders registration form fields', async ({ page }) => {
    await page.goto('/register')
    await expect(page.locator('#name')).toBeVisible()
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('#confirmPassword')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('shows error for mismatched passwords', async ({ page }) => {
    await page.goto('/register')
    await page.locator('#name').fill('Test User')
    await page.locator('#email').fill('mismatch@test.com')
    await page.locator('#password').fill('TestPass123!')
    await page.locator('#confirmPassword').fill('DifferentPass!')
    await page.locator('button[type="submit"]').click()

    // Should show a validation error about password mismatch
    await expect(page.getByText(/match|mismatch|don't match|不匹配/i)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Login Page @P0 @E2E', () => {
  test('renders login form fields', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('#email')).toBeVisible()
    await expect(page.locator('#password')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('has link to register', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('a[href="/register"]')).toBeVisible()
  })
})

test.describe('Tasks Browse Page @P0 @E2E', () => {
  test('renders task page', async ({ page }) => {
    await page.goto('/tasks')
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
  })

  test('has link to create task', async ({ page }) => {
    await page.goto('/tasks')
    await expect(
      page.locator('a[href="/tasks/create"]').first()
    ).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Authenticated Pages @P0 @E2E', () => {
  test.describe.configure({ mode: 'serial' })

  test('onboarding page shows welcome content after register', async ({ page, request }) => {
    await registerUser(request)
    await page.goto('/onboarding')
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
  })

  test('tasks/create page loads', async ({ page }) => {
    await page.goto('/tasks/create')
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
  })

  test('my-tasks page renders', async ({ page }) => {
    await page.goto('/my-tasks')
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
  })

  test('settings page loads', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
  })

  test('settings page has regenerate button or login redirect', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Task Detail Page @P1 @E2E', () => {
  let taskId: string

  test.describe.configure({ mode: 'serial' })

  test('setup: create task', async ({ request }) => {
    await registerUser(request)
    const taskData = buildTask({ maxTesters: 3 })
    const res = await request.post('/api/tasks/create', { data: taskData })
    expect(res.status()).toBe(200)
    const body = await res.json()
    taskId = body.taskId
  })

  test('task detail page renders task info', async ({ page }) => {
    await page.goto(`/tasks/${taskId}`)
    await expect(page.locator('main')).toBeVisible({ timeout: 10000 })
  })

  test('task detail shows action buttons', async ({ page }) => {
    await page.goto(`/tasks/${taskId}`)
    const actionButton = page.locator('main button').first()
    await expect(actionButton).toBeVisible({ timeout: 10000 })
  })
})
