import { getLogger } from './logger'
import { t } from '../../shared/i18n/server'

const logger = getLogger('AppError')

export enum ErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  MAINTENANCE = 'MAINTENANCE',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL = 'INTERNAL',
}

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.PAYLOAD_TOO_LARGE]: 413,
  [ErrorCode.MAINTENANCE]: 503,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.INTERNAL]: 500,
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly isPublic: boolean

  constructor(code: ErrorCode, message: string, isPublic = true) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = ERROR_STATUS_MAP[code]
    this.isPublic = isPublic
  }

  toJSON(): { error: string; code: string } {
    return {
      error: this.isPublic ? this.message : t('common.internalError', '服务器内部错误，请稍后重试'),
      code: this.code,
    }
  }
}

export function badRequest(message: string): AppError {
  return new AppError(ErrorCode.BAD_REQUEST, message)
}

export function unauthorized(message = t('errors.unauthorized', '未授权，请先登录')): AppError {
  return new AppError(ErrorCode.UNAUTHORIZED, message)
}

export function forbidden(message = t('errors.forbidden', '权限不足')): AppError {
  return new AppError(ErrorCode.FORBIDDEN, message)
}

export function notFound(message = t('errors.notFound', '资源不存在')): AppError {
  return new AppError(ErrorCode.NOT_FOUND, message)
}

export function conflict(message: string): AppError {
  return new AppError(ErrorCode.CONFLICT, message)
}

export function rateLimited(message = t('errors.rateLimited', '请求过于频繁，请稍后重试')): AppError {
  return new AppError(ErrorCode.RATE_LIMITED, message)
}

export function payloadTooLarge(message = t('errors.payloadTooLarge', '请求数据过大')): AppError {
  return new AppError(ErrorCode.PAYLOAD_TOO_LARGE, message)
}

export function serviceUnavailable(message: string): AppError {
  return new AppError(ErrorCode.SERVICE_UNAVAILABLE, message)
}

export function internalError(message: string): AppError {
  return new AppError(ErrorCode.INTERNAL, message, false)
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}

export function toErrorResponse(err: unknown): Response {
  if (isAppError(err)) {
    if (!err.isPublic || err.statusCode >= 500) {
      logger.error('AppError', { code: err.code, message: err.message, statusCode: err.statusCode })
    }
    return new Response(JSON.stringify(err.toJSON()), {
      status: err.statusCode,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const msg = err instanceof Error ? err.message : String(err)
  logger.error('Unhandled error', { error: msg })

  return new Response(
    JSON.stringify({ error: t('common.internalError', '服务器内部错误，请稍后重试'), code: ErrorCode.INTERNAL }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  )
}
