import { z } from 'zod';
import { jsonResponse, errorResponse, parseLLMResult } from '../../utils/response';
import { callLLM, createStreamResponse, resolveLLMConfig } from '../../utils/llm';
import { SYSTEM_PROMPTS, USER_PROMPTS, buildSystemPrompt } from '../../utils/prompts';
import { createAIHandler } from '../../utils/handler';
import { getLogger } from '../../utils/logger';
import { t } from '../../../shared/i18n/server';

const logger = getLogger('Plan')

const planSchema = z.object({
  formData: z.record(z.unknown()).refine((val) => Object.keys(val).length > 0, '表单数据不能为空'),
  stream: z.boolean().optional(),
});

export const onRequestPost = createAIHandler({
  schema: planSchema,
  rateLimit: { key: 'plan', limit: 10, windowSeconds: 3600 },
  action: 'plan',
  async handler(data, context, _tokenData) {
    const { formData, stream } = data;

    const llmConfig = await resolveLLMConfig(context.req.raw, context.env, _tokenData);
    if (!llmConfig) {
      return errorResponse(t('ai.errors.notConfigured', '未配置 AI API，请在设置中填写或联系管理员'), 503);
    }
    const { baseUrl, apiKey, model } = llmConfig;

    const response = await callLLM({
      baseUrl,
      apiKey,
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(SYSTEM_PROMPTS.PLAN_GENERATOR, context.req.raw) },
        { role: 'user', content: USER_PROMPTS.generatePlan(formData) },
      ],
      stream: stream ?? false,
      temperature: 0.6,
      max_tokens: 4000,
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
    const result = parseLLMResult(responseData);

    return jsonResponse({ result }, 200);
  },
});
