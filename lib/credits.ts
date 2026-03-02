import { prisma } from '@/lib/prisma'

export async function awardCredits(userId: string, amount: number, type: string, taskId?: string) {
  return prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
    }),
    prisma.creditTransaction.create({
      data: { userId, amount, type, taskId },
    }),
  ])
}

export async function spendCredits(userId: string, amount: number, type: string, taskId?: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user || user.credits < amount) {
    throw new Error(`Insufficient credits. Balance: ${user?.credits ?? 0}, required: ${amount}`)
  }

  return prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: amount } },
    }),
    prisma.creditTransaction.create({
      data: { userId, amount: -amount, type, taskId },
    }),
  ])
}

export async function getBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } })
  return user?.credits ?? 0
}

export async function refundCredits(userId: string, amount: number, taskId: string) {
  return awardCredits(userId, amount, 'TASK_REFUND', taskId)
}
