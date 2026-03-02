import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function requireApiKey(request: NextRequest) {
  const authorization = request.headers.get('authorization')
  if (!authorization) {
    return { user: null, error: NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 }) }
  }

  const parts = authorization.split(/\s+/)
  if (parts.length < 2 || parts[0].toLowerCase() !== 'bearer') {
    return { user: null, error: NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 }) }
  }

  const token = parts.slice(1).join(' ').trim()
  if (!token) {
    return { user: null, error: NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 }) }
  }

  const user = await prisma.user.findUnique({ where: { apiKey: token } })
  if (!user) {
    return { user: null, error: NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 }) }
  }

  return { user, error: null }
}
