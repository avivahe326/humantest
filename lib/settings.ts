import { prisma } from '@/lib/prisma'

// In-memory cache with 60s TTL
const cache = new Map<string, { value: string; expiresAt: number }>()
const CACHE_TTL = 60_000

export async function getSetting(key: string): Promise<string | null> {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  try {
    const row = await prisma.setting.findUnique({ where: { key } })
    if (row) {
      cache.set(key, { value: row.value, expiresAt: Date.now() + CACHE_TTL })
      return row.value
    }
    return null
  } catch {
    return null
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL })
}

export async function deleteSetting(key: string): Promise<void> {
  await prisma.setting.delete({ where: { key } }).catch(() => {})
  cache.delete(key)
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany()
  const result: Record<string, string> = {}
  for (const row of rows) {
    result[row.key] = row.value
    cache.set(row.key, { value: row.value, expiresAt: Date.now() + CACHE_TTL })
  }
  return result
}

export async function getConfig(key: string): Promise<string | null> {
  const dbValue = await getSetting(key)
  if (dbValue !== null) return dbValue
  return process.env[key] ?? null
}
