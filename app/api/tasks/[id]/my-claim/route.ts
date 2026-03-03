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
    select: { id: true },
  })

  if (!claim) {
    return NextResponse.json({ error: 'No active claim found' }, { status: 404 })
  }

  return NextResponse.json({ claimId: claim.id })
}
