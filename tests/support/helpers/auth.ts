import { APIRequestContext } from '@playwright/test';
import { buildUser } from '../factories';

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
 */
export async function registerUser(
  request: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<TestUser> {
  const userData = buildUser(overrides);

  const response = await request.post('/api/auth/register', {
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

  // Login to get session cookie
  const loginResponse = await request.post('/api/auth/callback/credentials', {
    form: {
      email: userData.email,
      password: userData.password,
      csrfToken: '',
      json: 'true',
    },
  });

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
