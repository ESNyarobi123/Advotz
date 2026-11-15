declare module "nodemailer" {
  export interface Transporter {
    sendMail(options: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
      replyTo?: string;
    }): Promise<{ messageId?: string }>;
    verify(): Promise<boolean>;
  }

  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
  }

  export function createTransport(options: TransportOptions): Transporter;

  const nodemailer: { createTransport: typeof createTransport };
  export default nodemailer;
}
