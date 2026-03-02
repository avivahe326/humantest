import { NextResponse } from 'next/server'

export function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  return response
}

export function corsOptionsResponse(): NextResponse {
  const response = new NextResponse(null, { status: 204 })
  return withCors(response)
}
