declare module 'nodemailer' {
  export interface Transporter {
    sendMail(options: SendMailOptions): Promise<SendMailResponse>
  }
  
  export interface SendMailOptions {
    from: string
    to: string
    subject: string
    html: string
  }
  
  export interface SendMailResponse {
    messageId: string
  }
  
  export function createTransport(config: any): Transporter
}
