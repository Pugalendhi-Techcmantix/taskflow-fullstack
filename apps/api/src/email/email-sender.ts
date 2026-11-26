import nodemailer from 'nodemailer';

export type EmailMessage = { to: string; subject: string; text: string; html: string };

/** Anything that can deliver an email. Swapped for a fake in tests. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  pass: string | undefined;
  from: string;
};

/**
 * Real delivery through any SMTP server (Gmail, company mail server, Mailtrap, SES, ...).
 * Port 587 with secure=false upgrades to TLS (STARTTLS); port 465 uses secure=true.
 */
export function createSmtpEmailSender(config: SmtpConfig): EmailSender & { verify(): Promise<void> } {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure, // never send credentials over an unencrypted connection
    ...(config.user && config.pass ? { auth: { user: config.user, pass: config.pass } } : {}),
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.from, ...message });
    },
    /** Connects and logs in without sending anything. */
    async verify() {
      await transport.verify();
    },
  };
}

/**
 * Development fallback when no SMTP server is configured: prints the email to the API terminal,
 * so invite links can still be opened. Never used in production (env validation refuses it).
 */
export function createConsoleEmailSender(print: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): EmailSender {
  return {
    async send(message) {
      const bar = '─'.repeat(64);
      print(`\n${bar}\n📧  EMAIL (not sent — SMTP is not configured)\nTo:      ${message.to}\nSubject: ${message.subject}\n${bar}\n${message.text}\n${bar}\n`);
    },
  };
}
