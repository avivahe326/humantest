import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { getBalance } from '@/lib/credits'

export async function GET() {
  const { user, error } = await requireAuth()
  if (error) return error

  const credits = await getBalance(user!.id)
  return NextResponse.json({ credits })
}
