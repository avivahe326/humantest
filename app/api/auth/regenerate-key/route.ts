import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const { user, error } = await requireAuth()
  if (error) return error

  const newKey = crypto.randomBytes(32).toString('hex')
  await prisma.user.update({
    where: { id: user!.id },
    data: { apiKey: newKey },
  })

  return NextResponse.json({ apiKey: newKey })
}
