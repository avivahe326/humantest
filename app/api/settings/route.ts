import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getAllSettings, setSetting } from '@/lib/settings'

async function isAdmin(userId: string): Promise<boolean> {
  const firstUser = await prisma.user.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  return firstUser?.id === userId
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await isAdmin(session.user.id)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const settings = await getAllSettings()
  return NextResponse.json({ settings })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = await isAdmin(session.user.id)
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    for (const [key, value] of Object.entries(body)) {
      if (typeof key !== 'string' || key.length > 100) continue
      if (typeof value === 'string') {
        await setSetting(key, value)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Settings update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
