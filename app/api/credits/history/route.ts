import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const { user, error } = await requireAuth()
  if (error) return error

  const [balance, transactions, apiKey] = await Promise.all([
    prisma.user.findUnique({ where: { id: user!.id }, select: { credits: true } }),
    prisma.creditTransaction.findMany({
      where: { userId: user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: false,
      },
    }),
    prisma.user.findUnique({ where: { id: user!.id }, select: { apiKey: true } }),
  ])

  return NextResponse.json({
    credits: balance?.credits ?? 0,
    apiKey: apiKey?.apiKey ?? '',
    transactions: transactions.map(t => ({
      id: t.id,
      amount: t.amount,
      type: t.type,
      taskId: t.taskId,
      createdAt: t.createdAt.toISOString(),
    })),
  })
}
