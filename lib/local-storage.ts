import { createHmac } from 'crypto'
import { generateObjectKey, MAX_UPLOAD_SIZE } from './oss'
import { getConfig } from '@/lib/settings'

export { generateObjectKey, MAX_UPLOAD_SIZE }

export async function isLocalStorage(): Promise<boolean> {
  const region = await getConfig('OSS_REGION')
  const bucket = await getConfig('OSS_BUCKET')
  return !region || !bucket
}

export function getLocalRecordingDir(): string {
  return 'data/recordings'
}

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('NEXTAUTH_SECRET is required for local storage')
  return secret
}

export function generateLocalUploadToken(objectKey: string): string {
  return createHmac('sha256', getSecret()).update(objectKey).digest('hex')
}

export function verifyLocalUploadToken(objectKey: string, token: string): boolean {
  const expected = generateLocalUploadToken(objectKey)
  return expected === token
}
