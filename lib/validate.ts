import { z } from 'zod/v4'

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(6).max(100),
})

export const createTaskSchema = z.object({
  url: z.url(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  focus: z.string().max(2000).optional(),
  requirements: z.any().optional(),
  maxTesters: z.number().int().min(1).max(50).optional(),
  rewardPerTester: z.number().int().min(1).max(1000).optional(),
  estimatedMinutes: z.number().int().min(1).max(120).optional(),
  webhookUrl: z.url().optional(),
})

export const submitFeedbackSchema = z.object({
  rawData: z.object({
    firstImpression: z.string().min(1).max(5000),
    steps: z.array(z.object({
      id: z.string(),
      answer: z.string().max(5000),
    })),
    nps: z.number().int().min(1).max(10),
    best: z.string().max(5000),
    worst: z.string().max(5000),
  }),
  screenRecUrl: z.url().optional(),
  audioUrl: z.url().optional(),
})

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^\[?::1\]?$/,
  /^\[?fc/i,
  /^\[?fd/i,
]

export function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    return PRIVATE_IP_PATTERNS.some(pattern => pattern.test(hostname))
  } catch {
    return true
  }
}

export function isSafeTargetUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
