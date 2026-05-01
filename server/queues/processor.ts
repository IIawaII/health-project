import { sendEmailViaSMTP, isSMTPTransientError } from '../utils/smtp'
import { getLogger } from '../utils/logger'
import { getConfigNumber } from '../utils/configDefaults'
import type { EmailQueueMessage, QueueMessage } from './types'
import type { Env } from '../utils/env'

const logger = getLogger('Queue')

const MAX_RETRIES = 3

export async function processEmailMessage(env: Env, message: EmailQueueMessage): Promise<void> {
  const { to, subject, html } = message.payload

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error('SMTP credentials not configured in environment')
  }

  const smtpConfig = {
    host: env.SMTP_HOST || 'smtp.163.com',
    port: parseInt(env.SMTP_PORT || '465', 10),
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    fromEmail: env.SMTP_USER,
    fromName: 'Cloud Health',
  }

  logger.info('Processing email queue message', { to, subject })

  const envTimeout = env.SMTP_TIMEOUT_MS ? parseInt(env.SMTP_TIMEOUT_MS, 10) : undefined
  const timeoutMs = await getConfigNumber(env.DB, 'smtp_timeout_ms', envTimeout ?? 15000)

  try {
    await sendEmailViaSMTP(smtpConfig, to, subject, html, timeoutMs)
    logger.info('Email sent successfully from queue', { to })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('SMTP send failed', {
      to,
      subject,
      error: errorMsg,
      transient: isSMTPTransientError(err),
    })
    throw err
  }
}

export async function processQueueMessage(env: Env, message: QueueMessage): Promise<void> {
  switch (message.type) {
    case 'send_email':
      await processEmailMessage(env, message)
      break
    default:
      logger.warn('Unknown queue message type', { type: (message as QueueMessage).type })
  }
}

export function shouldRetryMessage(err: unknown, attempt: number): { retry: boolean; delaySeconds: number } {
  if (attempt >= MAX_RETRIES) {
    return { retry: false, delaySeconds: 0 }
  }

  if (!isSMTPTransientError(err)) {
    return { retry: false, delaySeconds: 0 }
  }

  const delaySeconds = Math.min(60 * Math.pow(2, attempt), 300)
  return { retry: true, delaySeconds }
}

export function getRetryDelay(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt), 30000)
}

export { MAX_RETRIES }
