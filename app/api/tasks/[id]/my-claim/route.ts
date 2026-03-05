import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const claim = await prisma.taskClaim.findFirst({
    where: {
      taskId: id,
      userId: user!.id,
      status: 'IN_PROGRESS',
    },
    select: { id: true, screenRecUrl: true, audioUrl: true },
  })

  if (!claim) {
    return NextResponse.json({ error: 'No active claim found' }, { status: 404 })
  }

  return NextResponse.json({ claimId: claim.id, screenRecUrl: claim.screenRecUrl, audioUrl: claim.audioUrl })
}

// Save recording URLs to claim after upload completes
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params
  const body = await request.json()

  const claim = await prisma.taskClaim.findFirst({
    where: {
      taskId: id,
      userId: user!.id,
      status: 'IN_PROGRESS',
    },
  })

  if (!claim) {
    return NextResponse.json({ error: 'No active claim found' }, { status: 404 })
  }

  const data: Record<string, string> = {}
  if (body.screenRecUrl && typeof body.screenRecUrl === 'string') {
    data.screenRecUrl = body.screenRecUrl
  }
  if (body.audioUrl && typeof body.audioUrl === 'string') {
    data.audioUrl = body.audioUrl
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No URLs provided' }, { status: 400 })
  }

  await prisma.taskClaim.update({
    where: { id: claim.id },
    data,
  })

  return NextResponse.json({ ok: true })
}
