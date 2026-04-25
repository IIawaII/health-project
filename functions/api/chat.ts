import { z } from 'zod';
import { jsonResponse, errorResponse, parseLLMResult } from '../lib/response';
import { callLLM, createStreamResponse, resolveLLMConfig } from '../lib/llm';
import { SYSTEM_PROMPTS } from '../lib/prompts';
import { createAIHandler } from '../lib/handler';

const MAX_TOTAL_MESSAGE_CHARS = 20000;

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant', 'system'], { message: '消息角色只能是 user、assistant 或 system' }),
      content: z.string().min(1, '消息内容不能为空').max(8000, '单条消息内容过长'),
    })
  ).min(1, '消息列表不能为空').max(50, '消息数量过多'),
  stream: z.boolean().optional(),
});

export const onRequestPost = createAIHandler({
  schema: chatSchema,
  rateLimit: { key: 'chat', limit: 30, windowSeconds: 60 },
  async handler(data, context, _tokenData) {
    let { messages } = data;
    const { stream } = data;

    messages = messages.filter((m) => m.role !== 'system');
    if (messages.length === 0) {
      return errorResponse('消息内容不能为空', 400);
    }

    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
      return errorResponse('消息总长度超出限制，请缩短后重试', 413);
    }

    const llmConfig = resolveLLMConfig(context.request, context.env);
    if (!llmConfig) {
      return errorResponse('未配置 AI API，请在设置中填写或联系管理员', 503);
    }
    const { baseUrl, apiKey, model } = llmConfig;

    const response = await callLLM({
      baseUrl,
      apiKey,
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPTS.HEALTH_ADVISOR }, ...messages],
      stream: stream ?? false,
      temperature: 0.7,
      max_tokens: 3000,
    });

    if (!response.ok) {
      const err = await response.text();
      return errorResponse(`模型请求失败: ${err}`, 502);
    }

    if (stream) {
      return createStreamResponse(response);
    }

    const responseData = await response.json();
    const resultText = parseLLMResult(responseData);

    return jsonResponse({ result: resultText }, 200);
  },
});
