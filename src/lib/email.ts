import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
})

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string
  subject: string
  html: string
}) {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@centradox.com',
      to,
      subject,
      html,
    })
    return { success: true }
  } catch (error) {
    console.error('Email error:', error)
    return { success: false, error }
  }
}

export async function sendDocumentNotification({
  to,
  documentTitle,
  action,
  documentUrl,
}: {
  to: string
  documentTitle: string
  action: string
  documentUrl: string
}) {
  const subject = `Document ${action}: ${documentTitle}`
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Document ${action}</h2>
      <p style="color: #666;">The document <strong>${documentTitle}</strong> has been ${action.toLowerCase()}.</p>
      <a href="${documentUrl}" style="display: inline-block; padding: 10px 20px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px;">
        View Document
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        This is an automated message from Centradox Document Approval System.
      </p>
    </div>
  `
  return sendEmail({ to, subject, html })
}
