import { NextRequest, NextResponse } from 'next/server'
import { join, dirname } from 'path'
import { writeFile, mkdir } from 'fs/promises'
import { verifyLocalUploadToken, MAX_UPLOAD_SIZE } from '@/lib/local-storage'

export const runtime = 'nodejs'

export async function PUT(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  const token = request.nextUrl.searchParams.get('token')

  if (!key || !token) {
    return NextResponse.json({ error: 'Missing key or token' }, { status: 400 })
  }

  // Prevent path traversal
  if (key.includes('..') || !key.startsWith('recordings/')) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 400 })
  }

  if (!verifyLocalUploadToken(key, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  const contentLength = parseInt(request.headers.get('content-length') || '0', 10)
  const maxSize = key.includes('/screen-') ? MAX_UPLOAD_SIZE.screen : MAX_UPLOAD_SIZE.audio
  if (contentLength > maxSize) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 })
  }

  const body = await request.arrayBuffer()
  if (body.byteLength > maxSize) {
    return NextResponse.json({ error: 'File too large' }, { status: 413 })
  }

  const filePath = join(process.cwd(), 'data', key)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, Buffer.from(body))

  return NextResponse.json({ ok: true })
}
