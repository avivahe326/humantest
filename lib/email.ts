import nodemailer from 'nodemailer'

const globalForMailer = globalThis as unknown as {
  mailer: nodemailer.Transporter | undefined
}

function getTransporter(): nodemailer.Transporter {
  if (globalForMailer.mailer) return globalForMailer.mailer

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.mxhichina.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  globalForMailer.mailer = transporter
  return transporter
}

export async function sendVerificationCode(email: string, code: string): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[DEV] Verification code for ${email}: ${code}`)
    return
  }

  const transporter = getTransporter()

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"human_test()" <${process.env.SMTP_USER}>`,
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
