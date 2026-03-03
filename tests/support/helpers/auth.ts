import { APIRequestContext } from '@playwright/test';
import { buildUser } from '../factories';

let fakeIpCounter = 0;
const workerSeed = process.pid;

/** Generate a unique fake IP to bypass per-IP rate limiting in tests.
 *  Uses process.pid + counter to ensure uniqueness across parallel workers. */
function nextFakeIp(): string {
  fakeIpCounter++;
  const combined = workerSeed * 1000 + fakeIpCounter;
  const a = (combined >> 16) & 0xff;
  const b = (combined >> 8) & 0xff;
  const c = combined & 0xff;
  return `200.${a}.${b}.${c}`;
}

export type TestUser = {
  id: string;
  email: string;
  name: string;
  apiKey: string;
  credits: number;
  plainPassword: string;
  sessionCookie?: string;
};

/**
 * Register a new user via API and return their details including API key.
 * Uses a unique X-Forwarded-For to avoid IP-based rate limiting in tests.
 */
export async function registerUser(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const userData = buildUser(overrides);
  const fakeIp = nextFakeIp();

  const response = await request.post('/api/auth/register', {
    headers: { 'X-Forwarded-For': fakeIp },
    data: {
      email: userData.email,
      name: userData.name,
      password: userData.password,
    },
  });

  if (response.status() !== 200) {
    const body = await response.text();
    throw new Error(`Registration failed (${response.status()}): ${body}`);
  }

  const result = await response.json();

  // Login: first get CSRF token, then authenticate
  const csrfRes = await request.get('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();

  await request.post('/api/auth/callback/credentials', {
    form: {
      email: userData.email,
      password: userData.password,
      csrfToken,
      json: 'true',
    },
  });

  // Verify session is established
  const sessionRes = await request.get('/api/auth/session');
  const session = await sessionRes.json();
  if (!session?.user) {
    throw new Error(`Login failed: session not established for ${userData.email}`);
  }

  return {
    id: result.userId,
    email: userData.email,
    name: userData.name as string,
    apiKey: '', // Will be fetched separately if needed
    credits: 100,
    plainPassword: userData.password,
  };
}

/**
 * Login an existing user (no registration). Sets session cookie on the request context.
 */
export async function loginUser(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const csrfRes = await request.get('/api/auth/csrf');
  const { csrfToken } = await csrfRes.json();

  await request.post('/api/auth/callback/credentials', {
    form: { email, password, csrfToken, json: 'true' },
  });

  const sessionRes = await request.get('/api/auth/session');
  const session = await sessionRes.json();
  if (!session?.user) {
    throw new Error(`Login failed: session not established for ${email}`);
  }
}

/**
 * Create a task via Skill API using Bearer token auth.
 */
export async function createTaskViaSkillApi(
  request: APIRequestContext,
  apiKey: string,
  taskData: Record<string, unknown> = {},
) {
  const response = await request.post('/api/skill/human-test', {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { url: 'https://example.com', ...taskData },
  });
  return { response, body: await response.json() };
}
