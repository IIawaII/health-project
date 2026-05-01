import { z } from 'zod'
import { jsonResponse, errorResponse } from '../../utils/response'
import { verifyToken } from '../../utils/auth'
import { getAiConfig, upsertAiConfig, deleteAiConfig } from '../../dao/ai-config.dao'
import { findUserById } from '../../dao/user.dao'
import { getLogger } from '../../utils/logger'
import { invalidateAiConfigCache } from '../../utils/llm'
import { t } from '../../../shared/i18n/server'
import type { AppContext } from '../../utils/handler'

const logger = getLogger('AiConfigAPI')

const saveSchema = z.object({
  encryptedConfig: z.string().min(1),
  configIv: z.string().min(1),
})

export const onRequestGet = async (context: AppContext) => {
  try {
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env })
    if (!tokenData) {
      return errorResponse(t('auth.errors.sessionExpired', '登录已过期'), 401)
    }

    const config = await getAiConfig(context.env.DB, tokenData.userId)
    if (!config) {
      return jsonResponse({ success: true, data: null }, 200)
    }

    return jsonResponse({
      success: true,
      data: {
        encryptedConfig: config.encrypted_config,
        configIv: config.config_iv,
        updatedAt: config.updated_at,
      },
    }, 200)
  } catch (error) {
    logger.error('Failed to get AI config', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('aiConfig.errors.getFailed', '获取 AI 配置失败'), 500)
  }
}

export const onRequestPut = async (context: AppContext) => {
  try {
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env })
    if (!tokenData) {
      return errorResponse(t('auth.errors.sessionExpired', '登录已过期'), 401)
    }

    const body = await context.req.json<unknown>()
    const parseResult = saveSchema.safeParse(body)
    if (!parseResult.success) {
      return errorResponse(parseResult.error.errors[0]?.message || t('common.invalidParams', '参数错误'), 400)
    }

    const { encryptedConfig, configIv } = parseResult.data

    const dbUser = await findUserById(context.env.DB, tokenData.userId)
    if (!dbUser?.data_key) {
      return errorResponse(t('aiConfig.errors.dataKeyNotInitialized', '用户数据密钥未初始化'), 400)
    }

    await upsertAiConfig(context.env.DB, tokenData.userId, encryptedConfig, configIv)

    invalidateAiConfigCache(tokenData.userId)

    return jsonResponse({ success: true, message: t('aiConfig.messages.saved', 'AI 配置保存成功') }, 200)
  } catch (error) {
    logger.error('Failed to save AI config', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('aiConfig.errors.saveFailed', '保存 AI 配置失败'), 500)
  }
}

export const onRequestDelete = async (context: AppContext) => {
  try {
    const tokenData = await verifyToken({ request: context.req.raw, env: context.env })
    if (!tokenData) {
      return errorResponse(t('auth.errors.sessionExpired', '登录已过期'), 401)
    }

    await deleteAiConfig(context.env.DB, tokenData.userId)

    invalidateAiConfigCache(tokenData.userId)

    return jsonResponse({ success: true, message: t('aiConfig.messages.cleared', 'AI 配置已清除') }, 200)
  } catch (error) {
    logger.error('Failed to delete AI config', { error: error instanceof Error ? error.message : String(error) })
    return errorResponse(t('aiConfig.errors.deleteFailed', '清除 AI 配置失败'), 500)
  }
}
