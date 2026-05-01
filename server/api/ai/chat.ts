import { z } from 'zod';
import { jsonResponse, errorResponse, parseLLMResult } from '../../utils/response';
import { callLLM, createStreamResponse, resolveLLMConfig } from '../../utils/llm';
import { SYSTEM_PROMPTS, buildSystemPrompt } from '../../utils/prompts';
import { createAIHandler } from '../../utils/handler';
import { getLogger } from '../../utils/logger';
import { t } from '../../../shared/i18n/server';

const logger = getLogger('Chat')

const MAX_TOTAL_MESSAGE_CHARS = 20000;

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system'], { message: t('ai.validation.invalidMessageRole', '消息角色只能是 user、assistant 或 system') }),
      content: z.string().min(1, t('ai.validation.messageContentRequired', '消息内容不能为空')).max(8000, t('ai.validation.messageContentTooLong', '单条消息内容过长')),
    })
  ).min(1, t('ai.validation.messagesRequired', '消息列表不能为空')).max(50, t('ai.validation.tooManyMessages', '消息数量过多')),
  stream: z.boolean().optional(),
});

export const onRequestPost = createAIHandler({
  schema: chatSchema,
  rateLimit: { key: 'chat', limit: 30, windowSeconds: 60 },
  action: 'chat',
  async handler(data, context, _tokenData) {
    let { messages } = data;
    const { stream } = data;

    messages = messages.filter((m) => m.role !== 'system');
    if (messages.length === 0) {
      return errorResponse(t('ai.errors.emptyMessage', '消息内容不能为空'), 400);
    }

    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
      return errorResponse(t('ai.errors.messageTooLong', '消息总长度超出限制，请缩短后重试'), 413);
    }

    const llmConfig = await resolveLLMConfig(context.req.raw, context.env, _tokenData);
    if (!llmConfig) {
      return errorResponse(t('ai.errors.notConfigured', '未配置 AI API，请在设置中填写或联系管理员'), 503);
    }
    const { baseUrl, apiKey, model } = llmConfig;

    const systemPrompt = buildSystemPrompt(SYSTEM_PROMPTS.HEALTH_ADVISOR, context.req.raw);
    const response = await callLLM({
      baseUrl,
      apiKey,
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: stream ?? false,
      temperature: 0.7,
      max_tokens: 3000,
      ssrfCache: context.env.SSRF_CACHE,
    });

    if (!response.ok) {
      let errorDetail = ''
      try {
        errorDetail = await response.text()
      } catch { logger.debug('Failed to read error response body from LLM') }
      logger.error('LLM request failed', { status: response.status, detail: errorDetail, baseUrl, model })

      if (response.status === 401) {
        return errorResponse(t('ai.errors.apiKeyInvalid', 'API Key 无效或未授权，请检查 API Key 配置'), 401)
      }
      if (response.status === 404) {
        return errorResponse(t('ai.errors.endpointNotFound', 'API 端点不存在，请检查 Base URL 是否正确'), 404)
      }
      if (response.status === 429) {
        return errorResponse(t('ai.errors.rateLimited', 'API 请求频率超限，请稍后重试'), 429)
      }

      return errorResponse(t('ai.errors.modelFailed', '模型请求失败，请稍后重试'), 502)
    }

    if (stream) {
      return createStreamResponse(response);
    }

    const responseData = await response.json();
    const resultText = parseLLMResult(responseData);

    return jsonResponse({ result: resultText }, 200);
  },
});
