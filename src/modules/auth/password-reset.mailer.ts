import type { Logger } from 'pino';

import type { Environment } from '../../config/environment.js';

export interface PasswordResetEmail {
  recipientEmail: string;
  recipientName: string;
  resetUrl: string;
  expiresInMinutes: number;
  requestId: string;
}

export interface PasswordResetMailer {
  send(input: PasswordResetEmail): Promise<void>;
}

class DisabledPasswordResetMailer implements PasswordResetMailer {
  public constructor(private readonly logger: Logger) {}

  public send(input: PasswordResetEmail): Promise<void> {
    this.logger.warn(
      { requestId: input.requestId },
      'Password-reset email was not sent because email delivery is disabled',
    );
    return Promise.reject(new Error('Password-reset email delivery is disabled'));
  }
}

class ConsolePasswordResetMailer implements PasswordResetMailer {
  public constructor(private readonly logger: Logger) {}

  public send(input: PasswordResetEmail): Promise<void> {
    this.logger.info(
      {
        recipientEmail: input.recipientEmail,
        resetUrl: input.resetUrl,
        requestId: input.requestId,
      },
      'Development password-reset email',
    );
    return Promise.resolve();
  }
}

class ResendPasswordResetMailer implements PasswordResetMailer {
  public constructor(private readonly environment: Environment) {}

  public async send(input: PasswordResetEmail): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.environment.EMAIL_TIMEOUT_MS);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.environment.RESEND_API_KEY!}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `password-reset-${input.requestId}`,
          'User-Agent': 'Velora-Wallet/1.0',
        },
        body: JSON.stringify({
          from: this.environment.EMAIL_FROM,
          to: [input.recipientEmail],
          subject: 'Reset your Velora password',
          text: createPlainText(input),
          html: createHtml(input),
          tags: [{ name: 'category', value: 'password_reset' }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Resend rejected the password-reset email with status ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createPasswordResetMailer(
  environment: Environment,
  logger: Logger,
): PasswordResetMailer {
  if (environment.EMAIL_PROVIDER === 'resend') {
    return new ResendPasswordResetMailer(environment);
  }
  if (environment.EMAIL_PROVIDER === 'console') {
    return new ConsolePasswordResetMailer(logger);
  }
  return new DisabledPasswordResetMailer(logger);
}

function createPlainText(input: PasswordResetEmail): string {
  return [
    `Hello ${input.recipientName},`,
    '',
    'We received a request to reset your Velora password.',
    `Open this secure link within ${input.expiresInMinutes} minutes:`,
    input.resetUrl,
    '',
    'If you did not request this, you can ignore this email. Your password has not changed.',
  ].join('\n');
}

function createHtml(input: PasswordResetEmail): string {
  const name = escapeHtml(input.recipientName);
  const resetUrl = escapeHtml(input.resetUrl);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#0d1930">
    <div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border-radius:16px">
      <div style="font-size:22px;font-weight:700;color:#2554e8">velora</div>
      <h1 style="font-size:26px;margin:28px 0 12px">Reset your password</h1>
      <p>Hello ${name},</p>
      <p>Use the button below within ${input.expiresInMinutes} minutes. This link works once.</p>
      <p style="margin:28px 0">
        <a href="${resetUrl}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:#2554e8;color:#fff;text-decoration:none;font-weight:700">Reset password</a>
      </p>
      <p style="font-size:13px;color:#6b7689">If you did not request this, ignore this email. Your password has not changed.</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character]!;
  });
}
