import nodemailer from 'nodemailer';
import { getSmtpEmailConfig } from '../config/env.js';

let cachedTransporter: nodemailer.Transporter | null = null;
let cachedKey: string | null = null;

type PasswordActionEmailInput = {
  to: string;
  name: string;
  url: string;
  isInitialSetup: boolean;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTransporter(): nodemailer.Transporter {
  const config = getSmtpEmailConfig();
  if (!config) {
    throw new Error('SMTP email provider is not configured.');
  }

  const cacheKey = [
    config.host,
    config.port,
    config.secure,
    config.user,
    config.from,
  ].join('|');

  if (cachedTransporter && cachedKey === cacheKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
  cachedKey = cacheKey;

  return cachedTransporter;
}

export function isSmtpEmailEnabled(): boolean {
  return getSmtpEmailConfig() !== null;
}

export async function sendPasswordActionEmail(
  input: PasswordActionEmailInput,
): Promise<void> {
  const config = getSmtpEmailConfig();
  if (!config) {
    throw new Error('SMTP email provider is not configured.');
  }

  const transporter = getTransporter();
  const appLabel = 'ROSS';
  const actionLabel = input.isInitialSetup
    ? 'Buat Password Akun'
    : 'Reset Password Akun';
  const lead = input.isInitialSetup
    ? 'Akun Anda sudah dibuat. Silakan buat password pertama Anda melalui tombol di bawah ini.'
    : 'Kami menerima permintaan untuk mereset password akun Anda. Gunakan tombol di bawah ini untuk membuat password baru.';
  const footer = input.isInitialSetup
    ? 'Jika Anda tidak merasa dibuatkan akun ini, abaikan email ini atau hubungi admin.'
    : 'Jika Anda tidak meminta reset password, abaikan email ini. Password Anda tidak akan berubah sebelum link ini digunakan.';

  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.url);

  await transporter.sendMail({
    from: config.from,
    to: input.to,
    subject: `${appLabel} - ${actionLabel}`,
    text: [
      `Halo ${input.name},`,
      '',
      lead,
      '',
      `Buka link berikut: ${input.url}`,
      '',
      footer,
      '',
      'Link ini memiliki masa berlaku terbatas demi keamanan.',
    ].join('\n'),
    html: `
      <div style="margin:0;padding:24px;background:#0b1220;font-family:Arial,sans-serif;color:#d7e5f2">
        <div style="max-width:560px;margin:0 auto;background:#111a2e;border:1px solid #22304b;border-radius:16px;padding:32px">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#60a5fa;margin-bottom:16px">${appLabel}</div>
          <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#f8fbff">${actionLabel}</h1>
          <p style="margin:0 0 16px;color:#c0d0e0">Halo ${safeName},</p>
          <p style="margin:0 0 24px;color:#c0d0e0;line-height:1.7">${escapeHtml(lead)}</p>
          <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#22c55e;color:#06121d;text-decoration:none;font-weight:700">
            ${actionLabel}
          </a>
          <p style="margin:24px 0 8px;color:#9fb3c8;line-height:1.7">${escapeHtml(
            footer,
          )}</p>
          <p style="margin:0;color:#7890aa;line-height:1.7">Jika tombol tidak berfungsi, salin link ini ke browser Anda:</p>
          <p style="margin:8px 0 0;word-break:break-all;color:#93c5fd">${safeUrl}</p>
        </div>
      </div>
    `,
  });
}
