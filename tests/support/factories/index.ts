import { faker } from '@faker-js/faker';
import crypto from 'crypto';

/**
 * Generate test user data (plain object, not DB record).
 * Use with API calls or direct Prisma seeding.
 */
export function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    email: faker.internet.email().toLowerCase(),
    name: faker.person.fullName(),
    password: 'TestPass123!',
    ...overrides,
  };
}

/**
 * Generate test task creation payload.
 */
export function buildTask(overrides: Record<string, unknown> = {}) {
  return {
    url: faker.internet.url({ protocol: 'https' }),
    title: `Test: ${faker.internet.domainName()}`,
    description: faker.lorem.sentence(),
    focus: faker.lorem.words(3),
    maxTesters: 5,
    estimatedMinutes: 10,
    ...overrides,
  };
}

/**
 * Generate feedback submission payload.
 */
export function buildFeedback(overrides: Record<string, unknown> = {}) {
  return {
    rawData: {
      firstImpression: faker.lorem.sentences(2),
      steps: [
        { id: 'step_1', answer: faker.lorem.sentence() },
        { id: 'step_2', answer: faker.lorem.sentence() },
      ],
      nps: faker.number.int({ min: 1, max: 10 }),
      best: faker.lorem.sentence(),
      worst: faker.lorem.sentence(),
    },
    ...overrides,
  };
}

/**
 * Generate a valid API key (same format as production).
 */
export function buildApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
