import { connect } from 'cloudflare:sockets';

export interface SMTPConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function sanitizeSMTPParam(value: string): string {
  return value.replace(/[\r\n\0]/g, '');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/.test(email) && !/[\r\n\0]/.test(email);
}

const DEFAULT_SMTP_TIMEOUT_MS = 15000

class SMTPTimeoutError extends Error {
  constructor(message = 'SMTP connection timed out') {
    super(message);
    this.name = 'SMTPTimeoutError';
  }
}

class SMTPConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SMTPConnectionError';
  }
}

export function isSMTPTransientError(err: unknown): boolean {
  if (err instanceof SMTPTimeoutError) return true
  if (err instanceof SMTPConnectionError) return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return msg.includes('timed out') || msg.includes('connection') || msg.includes('network') || msg.includes('econnrefused')
  }
  return false
}

export async function sendEmailViaSMTP(
  config: SMTPConfig,
  to: string,
  subject: string,
  html: string,
  timeoutMs?: number
): Promise<void> {
  if (!isValidEmail(to)) {
    throw new Error('Invalid recipient email address');
  }
  if (!isValidEmail(config.fromEmail)) {
    throw new Error('Invalid sender email address');
  }

  const abortController = new AbortController();
  let socket: Awaited<ReturnType<typeof connect>>;
  try {
    socket = await Promise.race([
      connect(`${sanitizeSMTPParam(config.host)}:${config.port}`, { secureTransport: 'on', allowHalfOpen: false }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new SMTPTimeoutError(`SMTP connection to ${config.host}:${config.port} timed out`)), timeoutMs ?? DEFAULT_SMTP_TIMEOUT_MS)),
    ]);
  } catch (err) {
    if (err instanceof SMTPTimeoutError) throw err;
    throw new SMTPConnectionError(`Failed to connect to ${config.host}:${config.port} - ${err instanceof Error ? err.message : String(err)}`);
  }
  const reader = socket.readable.getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const writer = socket.writable.getWriter() as WritableStreamDefaultWriter<Uint8Array>;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = '';
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  function resetTimeout() {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      abortController.abort();
    }, timeoutMs ?? DEFAULT_SMTP_TIMEOUT_MS);
  }

  function clearCurrentTimeout() {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  }

  function checkAbort(): void {
    if (abortController.signal.aborted) {
      throw new SMTPTimeoutError();
    }
  }

  async function readResponse(): Promise<{ code: number; text: string }> {
    resetTimeout();
    try {
      while (true) {
        checkAbort();
        const lines = buffer.split('\r\n');
        for (let i = 0; i < lines.length - 1; i++) {
          if (lines[i].length >= 4 && lines[i][3] === ' ') {
            const code = parseInt(lines[i].substring(0, 3), 10);
            const text = lines.slice(0, i + 1).join('\r\n');
            buffer = lines.slice(i + 1).join('\r\n');
            return { code, text };
          }
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('SMTP connection closed unexpectedly');
        buffer += decoder.decode(value, { stream: true });
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        throw new SMTPTimeoutError();
      }
      throw err;
    }
  }

  async function sendCommand(cmd: string): Promise<{ code: number; text: string }> {
    checkAbort();
    resetTimeout();
    await writer.write(encoder.encode(sanitizeSMTPParam(cmd) + '\r\n'));
    return readResponse();
  }

  try {
    const greeting = await readResponse();
    if (greeting.code !== 220) {
      throw new Error('SMTP greeting failed');
    }

    const ehlo = await sendCommand('EHLO localhost');
    if (ehlo.code !== 250) {
      throw new Error('EHLO failed');
    }

    const auth = await sendCommand('AUTH LOGIN');
    if (auth.code !== 334) {
      throw new Error('AUTH LOGIN not supported');
    }

    const userResp = await sendCommand(utf8ToBase64(config.user));
    if (userResp.code !== 334) {
      throw new Error('SMTP auth user rejected');
    }

    const passResp = await sendCommand(utf8ToBase64(config.pass));
    if (passResp.code !== 235) {
      throw new Error('SMTP authentication failed');
    }

    const mailFrom = await sendCommand(`MAIL FROM:<${config.fromEmail}>`);
    if (mailFrom.code !== 250) {
      throw new Error('Sender address rejected');
    }

    const rcptTo = await sendCommand(`RCPT TO:<${to}>`);
    if (rcptTo.code !== 250) {
      throw new Error('Recipient address rejected');
    }

    const dataResp = await sendCommand('DATA');
    if (dataResp.code !== 354) {
      throw new Error('DATA command failed');
    }

    const subjectEncoded = `=?utf-8?B?${utf8ToBase64(subject)}?=`;
    const fromNameEncoded = `=?utf-8?B?${utf8ToBase64(config.fromName)}?=`;
    const htmlBase64 = utf8ToBase64(html);
    const htmlLines = htmlBase64.match(/.{1,76}/g) || [htmlBase64];

    const emailContent = [
      `From: "${fromNameEncoded}" <${config.fromEmail}>`,
      `To: <${to}>`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      ...htmlLines,
      '.',
    ].join('\r\n');

    const sendResp = await sendCommand(emailContent);
    if (sendResp.code !== 250) {
      throw new Error('Email delivery failed');
    }

    await sendCommand('QUIT');
  } finally {
    clearCurrentTimeout();
    try { reader.cancel(); } catch { /* ignore - cleanup only */ }
    try { writer.close(); } catch { /* ignore - cleanup only */ }
    try { socket.close(); } catch { /* ignore - cleanup only */ }
  }
}
