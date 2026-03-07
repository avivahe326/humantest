import { createHmac } from 'crypto'
import { generateObjectKey, MAX_UPLOAD_SIZE } from './oss'

export { generateObjectKey, MAX_UPLOAD_SIZE }

export function isLocalStorage(): boolean {
  return !process.env.OSS_REGION || !process.env.OSS_BUCKET
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
