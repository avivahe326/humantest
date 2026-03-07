import { z } from 'zod/v4'

export const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(6).max(100),
})

export const sendCodeSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(6).max(100),
})

export const registerWithCodeSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.email(),
  password: z.string().min(6).max(100),
  code: z.string().regex(/^\d{6}$/, 'Verification code must be 6 digits'),
})

export const createTaskSchema = z.object({
  url: z.url(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  focus: z.string().max(2000).optional(),
  requirements: z.any().optional(),
  maxTesters: z.number().int().min(1).max(50).optional(),
  estimatedMinutes: z.number().int().min(1).max(120).optional(),
  webhookUrl: z.url().optional(),
  repoUrl: z.string().max(2000).optional(),
  repoBranch: z.string().max(200).optional(),
})

const recordingUrlSchema = z.string().refine(
  (url) => {
    // Allow relative paths for local storage (e.g. /api/recordings/serve/...)
    if (url.startsWith('/')) return true
    try { return new URL(url).protocol === 'https:' } catch { return false }
  },
  { message: 'URL must be a relative path or use HTTPS protocol' }
)

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
  screenRecUrl: recordingUrlSchema.optional(),
  audioUrl: recordingUrlSchema.optional(),
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

export function isValidRepoUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    if (url.protocol !== 'https:') return false
    const host = url.hostname.toLowerCase()
    if (host !== 'github.com' && host !== 'gitee.com') return false
    // Must have at least owner/repo in path
    const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
    return parts.length >= 2
  } catch {
    return false
  }
}
