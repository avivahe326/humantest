import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { generatePresignedUrl } from '@/lib/oss'
import { isLocalStorage, generateObjectKey, generateLocalUploadToken } from '@/lib/local-storage'
import { RateLimiter, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const limiter = new RateLimiter({ windowMs: 60_000, maxRequests: 10 })

const presignSchema = z.object({
  taskId: z.string(),
  claimId: z.string(),
  type: z.enum(['screen', 'audio']),
})

export async function POST(request: NextRequest) {
  const { user, error } = await requireAuth()
  if (error) return error

  const ip = getClientIp(request)
  const rl = limiter.check(`presign:${user!.id}:${ip}`)
  if (!rl.allowed) return rateLimitResponse(rl)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = presignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { taskId, claimId, type } = parsed.data

  // Cross-validate: claim belongs to this user, this task, and is IN_PROGRESS
  const claim = await prisma.taskClaim.findFirst({
    where: {
      id: claimId,
      taskId: taskId,
      userId: user!.id,
      status: 'IN_PROGRESS',
    },
  })

  if (!claim) {
    return NextResponse.json({ error: 'Invalid or unauthorized claim' }, { status: 403 })
  }

  if (isLocalStorage()) {
    const objectKey = generateObjectKey(taskId, claimId, type)
    const token = generateLocalUploadToken(objectKey)
    const uploadUrl = `/api/recordings/upload?key=${encodeURIComponent(objectKey)}&token=${encodeURIComponent(token)}`
    const objectUrl = `/api/recordings/serve/${objectKey.replace('recordings/', '')}`
    return NextResponse.json({ uploadUrl, objectUrl })
  }

  const { uploadUrl, objectUrl } = await generatePresignedUrl(taskId, claimId, type)

  return NextResponse.json({ uploadUrl, objectUrl })
}
