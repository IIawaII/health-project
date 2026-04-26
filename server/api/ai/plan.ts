import { z } from 'zod';
import { jsonResponse, errorResponse, parseLLMResult } from '../../utils/response';
import { callLLM, createStreamResponse, resolveLLMConfig } from '../../utils/llm';
import { SYSTEM_PROMPTS, USER_PROMPTS } from '../../utils/prompts';
import { createAIHandler } from '../../utils/handler';

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

    const llmConfig = resolveLLMConfig(context.req.raw, context.env);
    if (!llmConfig) {
      return errorResponse('未配置 AI API，请在设置中填写或联系管理员', 503);
    }
    const { baseUrl, apiKey, model } = llmConfig;

    const response = await callLLM({
      baseUrl,
      apiKey,
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPTS.PLAN_GENERATOR },
        { role: 'user', content: USER_PROMPTS.generatePlan(formData) },
      ],
      stream: stream ?? false,
      temperature: 0.6,
      max_tokens: 4000,
    });

    if (!response.ok) {
      const err = await response.text();
      return errorResponse(`模型请求失败: ${err}`, 502);
    }

    if (stream) {
      return createStreamResponse(response);
    }

    const responseData = await response.json();
    const result = parseLLMResult(responseData);

    return jsonResponse({ result }, 200);
  },
});
