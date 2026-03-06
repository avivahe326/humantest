import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    emailVerification: !!process.env.SMTP_HOST,
  })
}
