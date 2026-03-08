import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface RequireApiKeyOptions {
  optional?: boolean
}

export async function requireApiKey(request: NextRequest, options: RequireApiKeyOptions = {}) {
  const authorization = request.headers.get('authorization')

  if (authorization) {
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

    return { user, error: null, isAdminFallback: false }
  }

  // No auth header
  if (options.optional) {
    const adminUser = await prisma.user.findUnique({ where: { email: 'admin@humantest.local' } })
    if (adminUser) {
      return { user: adminUser, error: null, isAdminFallback: true }
    }
  }

  return { user: null, error: NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 }) }
}
