import nodemailer from "nodemailer";
import { env } from "../config/env.js";

interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailResult {
  delivered: boolean;
  status: "sent" | "preview";
  messageId?: string;
}

function smtpConfigured() {
  return Boolean(env.SMTP_HOST && env.MAIL_FROM);
}

function createTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER || env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  if (!smtpConfigured()) {
    console.info(
      [
        "[email preview]",
        `To: ${input.to}`,
        `From: ${env.MAIL_FROM}`,
        `Subject: ${input.subject}`,
        "",
        input.text
      ].join("\n")
    );
    return { delivered: false, status: "preview" };
  }

  const result = await createTransporter().sendMail({
    from: env.MAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  return { delivered: true, status: "sent", messageId: result.messageId };
}
