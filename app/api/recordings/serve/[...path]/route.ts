import { NextRequest, NextResponse } from 'next/server'
import { join } from 'path'
import { readFile, stat } from 'fs/promises'

export const runtime = 'nodejs'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const relativePath = path.join('/')

  // Prevent path traversal
  if (relativePath.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  const filePath = join(process.cwd(), 'data', 'recordings', relativePath)

  try {
    await stat(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const data = await readFile(filePath)
  const contentType = filePath.endsWith('.webm')
    ? (relativePath.includes('/screen-') ? 'video/webm' : 'audio/webm')
    : 'application/octet-stream'

  return new NextResponse(data, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
