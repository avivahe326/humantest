import OSS from 'ali-oss'
import { randomUUID } from 'crypto'
import { getConfig } from '@/lib/settings'

const ECS_METADATA_BASE = 'http://100.100.100.200/latest/meta-data/ram/security-credentials'

interface STSCredentials {
  AccessKeyId: string
  AccessKeySecret: string
  SecurityToken: string
  Expiration: string
}

async function getOssRoleName(): Promise<string> {
  return await getConfig('OSS_ROLE_NAME') || 'humantest'
}

async function fetchSTSFromMetadata(): Promise<STSCredentials> {
  const roleName = await getOssRoleName()
  const res = await fetch(`${ECS_METADATA_BASE}/${roleName}`, {
    headers: { 'X-aliyun-ecs-metadata-token-ttl-seconds': '900' },
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch STS credentials from ECS metadata: ${res.status}`)
  }
  return res.json()
}

let cachedClient: OSS | null = null
let credentialsExpiry = 0
let cachedOssConfig = ''

async function getOssClient(): Promise<OSS> {
  const region = await getConfig('OSS_REGION') || ''
  const bucket = await getConfig('OSS_BUCKET') || ''
  const configKey = `${region}:${bucket}`
  const now = Date.now()

  if (cachedClient && cachedOssConfig === configKey && credentialsExpiry > now + 5 * 60 * 1000) {
    return cachedClient
  }

  cachedOssConfig = configKey
  const creds = await fetchSTSFromMetadata()
  credentialsExpiry = new Date(creds.Expiration).getTime()

  cachedClient = new OSS({
    region,
    bucket,
    accessKeyId: creds.AccessKeyId,
    accessKeySecret: creds.AccessKeySecret,
    stsToken: creds.SecurityToken,
    secure: true,
    refreshSTSToken: async () => {
      const newCreds = await fetchSTSFromMetadata()
      credentialsExpiry = new Date(newCreds.Expiration).getTime()
      return {
        accessKeyId: newCreds.AccessKeyId,
        accessKeySecret: newCreds.AccessKeySecret,
        stsToken: newCreds.SecurityToken,
      }
    },
    refreshSTSTokenInterval: 300_000,
  })

  return cachedClient
}

export const MAX_UPLOAD_SIZE = {
  screen: 200 * 1024 * 1024, // 200MB
  audio: 50 * 1024 * 1024,   // 50MB
} as const

export function generateObjectKey(
  taskId: string,
  claimId: string,
  type: 'screen' | 'audio'
): string {
  const id = randomUUID().slice(0, 8)
  return `recordings/${taskId}/${claimId}/${type}-${Date.now()}-${id}.webm`
}

export async function generatePresignedUrl(
  taskId: string,
  claimId: string,
  type: 'screen' | 'audio'
): Promise<{ uploadUrl: string; objectUrl: string }> {
  const client = await getOssClient()
  const objectKey = generateObjectKey(taskId, claimId, type)
  const contentType = type === 'screen' ? 'video/webm' : 'audio/webm'

  const uploadUrl = client.signatureUrl(objectKey, {
    method: 'PUT',
    expires: 1800,
    'Content-Type': contentType,
  } as Parameters<OSS['signatureUrl']>[1])

  const region = await getConfig('OSS_REGION') || ''
  const bucket = await getConfig('OSS_BUCKET') || ''
  const objectUrl = `https://${bucket}.${region}.aliyuncs.com/${objectKey}`

  return { uploadUrl, objectUrl }
}
