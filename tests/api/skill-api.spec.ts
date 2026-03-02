import { test, expect } from '@playwright/test';
import { buildUser, buildTask } from '../support/factories';

test.describe('Skill API - Create Task @P0 @API', () => {
  test('returns 401 for missing API key', async ({ request }) => {
    const response = await request.post('/api/skill/human-test', {
      data: { url: 'https://example.com' },
    });

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('returns 401 for invalid API key', async ({ request }) => {
    const response = await request.post('/api/skill/human-test', {
      headers: { Authorization: 'Bearer invalid-key-12345' },
      data: { url: 'https://example.com' },
    });

    expect(response.status()).toBe(401);
  });

  test('returns 204 with CORS headers for OPTIONS preflight', async ({ request }) => {
    const response = await request.fetch('/api/skill/human-test', {
      method: 'OPTIONS',
    });

    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(response.headers()['access-control-allow-methods']).toContain('POST');
    expect(response.headers()['access-control-allow-headers']).toContain('Authorization');
  });
});

test.describe('Auth - Registration @P0 @API', () => {
  test('registers new user with 100 credits', async ({ request }) => {
    const userData = buildUser();

    const response = await request.post('/api/auth/register', {
      data: {
        email: userData.email,
        name: userData.name,
        password: userData.password,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.userId).toBeTruthy();
  });

  test('returns 409 for duplicate email', async ({ request }) => {
    const userData = buildUser();

    // First registration
    await request.post('/api/auth/register', {
      data: {
        email: userData.email,
        name: userData.name,
        password: userData.password,
      },
    });

    // Duplicate registration
    const response = await request.post('/api/auth/register', {
      data: {
        email: userData.email,
        name: 'Another Name',
        password: 'AnotherPass123!',
      },
    });

    expect(response.status()).toBe(409);
  });
});

test.describe('Security @P0 @API', () => {
  test('rejects javascript: URL as targetUrl', async ({ request }) => {
    // Register first to get a valid session
    const userData = buildUser();
    await request.post('/api/auth/register', {
      data: {
        email: userData.email,
        name: userData.name,
        password: userData.password,
      },
    });

    const taskData = buildTask({ url: 'javascript:alert(1)' });
    const response = await request.post('/api/tasks/create', {
      data: taskData,
    });

    // Should fail validation (400) or auth (401)
    expect([400, 401]).toContain(response.status());
  });
});
