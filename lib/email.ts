import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email via Gmail SMTP (App Password auth).
 *
 * Configure in .env:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 *
 * If SMTP isn't configured (e.g. local dev), sends are skipped and the message
 * is logged to the server console instead — so the verification flow stays
 * testable without real credentials.
 */

const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || SMTP_USER;

export function emailConfigured(): boolean {
  return Boolean(SMTP_USER && SMTP_PASS);
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendMail(mail: Mail): Promise<void> {
  if (!emailConfigured()) {
    // Dev fallback — surface the contents so flows can be exercised offline.
    console.warn(
      `[email] SMTP not configured; skipping send to ${mail.to}\n` +
        `        Subject: ${mail.subject}\n        ${mail.text}`
    );
    return;
  }
  await getTransporter().sendMail({
    from: EMAIL_FROM,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    // Gmail rewrites From to the authenticated account unless the alias is a
    // verified "Send mail as"; set the envelope sender to the real account so
    // SPF/auth still passes.
    envelope: { from: SMTP_USER, to: mail.to },
  });
}

/** Send the account-verification email containing a one-click link. */
export async function sendVerificationEmail(
  to: string,
  name: string,
  link: string
): Promise<void> {
  const safeName = (name || "there").trim();
  const subject = "Verify your KodaAI email";
  const text =
    `Hi ${safeName},\n\n` +
    `Confirm your email to activate your KodaAI account:\n${link}\n\n` +
    `This link expires in 24 hours. If you didn't sign up, you can ignore this email.`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0b0b0d;padding:32px;color:#e7e7ea">
    <div style="max-width:480px;margin:0 auto;background:#141416;border:1px solid #26262b;border-radius:16px;padding:32px">
      <h1 style="margin:0 0 8px;font-size:20px;color:#fff">Verify your email</h1>
      <p style="margin:0 0 20px;color:#a1a1aa;font-size:14px;line-height:1.6">
        Hi ${escapeHtml(safeName)}, confirm your email to activate your KodaAI account.
      </p>
      <a href="${link}" style="display:inline-block;background:#7c5cff;color:#000;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:14px">
        Verify email
      </a>
      <p style="margin:22px 0 0;color:#71717a;font-size:12px;line-height:1.6">
        Or paste this link into your browser:<br>
        <span style="color:#a1a1aa;word-break:break-all">${link}</span>
      </p>
      <p style="margin:18px 0 0;color:#52525b;font-size:12px">
        This link expires in 24 hours. If you didn't sign up, you can ignore this email.
      </p>
    </div>
  </div>`;

  await sendMail({ to, subject, html, text });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
