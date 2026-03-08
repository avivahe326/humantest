import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/settings'

export async function GET() {
  const smtpHost = await getConfig('SMTP_HOST')
  return NextResponse.json({
    emailVerification: !!smtpHost,
  })
}
