import nodemailer from 'nodemailer'
import { getConfig } from '@/lib/settings'

let cachedTransporter: nodemailer.Transporter | null = null
let cachedSmtpConfig = ''

async function getTransporter(): Promise<nodemailer.Transporter> {
  const host = await getConfig('SMTP_HOST') || ''
  const port = await getConfig('SMTP_PORT') || '465'
  const user = await getConfig('SMTP_USER') || ''
  const pass = await getConfig('SMTP_PASS') || ''
  const configKey = `${host}:${port}:${user}:${pass}`

  if (cachedTransporter && cachedSmtpConfig === configKey) return cachedTransporter

  cachedSmtpConfig = configKey
  cachedTransporter = nodemailer.createTransport({
    host,
    port: Number(port) || 465,
    secure: true,
    auth: { user, pass },
  })

  return cachedTransporter
}

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  const smtpUser = await getConfig('SMTP_USER')
  const smtpPass = await getConfig('SMTP_PASS')

  if (!smtpUser || !smtpPass) {
    console.log(`[DEV] Verification code for ${email}: ${code}`)
    return
  }

  const transporter = await getTransporter()
  const smtpFrom = await getConfig('SMTP_FROM')

  await transporter.sendMail({
    from: smtpFrom || `"human_test()" <${smtpUser}>`,
    to: email,
    subject: 'human_test() - Email Verification Code',
    text: `Your verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
        <h2 style="color: #fff; background: #18181b; padding: 16px 24px; border-radius: 8px 8px 0 0; margin: 0;">
          human_test()
        </h2>
        <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
          <p>Your verification code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px; background: #f4f4f5; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="color: #71717a; font-size: 14px;">This code expires in 10 minutes.</p>
          <p style="color: #71717a; font-size: 14px;">If you did not request this, please ignore this email.</p>
        </div>
      </div>
    `,
  })
}
