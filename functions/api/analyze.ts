import { z } from 'zod';
import { jsonResponse, errorResponse, parseLLMResult } from '../lib/response';
import { callLLM, createStreamResponse, resolveLLMConfig } from '../lib/llm';
import { SYSTEM_PROMPTS, USER_PROMPTS } from '../lib/prompts';
import { createAIHandler } from '../lib/handler';

const MAX_FILE_SIZE_MB = 5;

const analyzeSchema = z.object({
  fileData: z.string().min(1, '请上传文件').max(15 * 1024 * 1024, '文件数据过大'),
  fileType: z.enum(['image/png', 'image/jpeg', 'image/jpg', 'application/pdf', 'text/plain'], {
    message: '不支持的文件类型，仅支持 PNG、JPG、PDF、TXT',
  }),
  fileName: z.string().min(1, '文件名不能为空').max(255, '文件名过长'),
  stream: z.boolean().optional(),
});

export const onRequestPost = createAIHandler({
  schema: analyzeSchema,
  rateLimit: { key: 'analyze', limit: 20, windowSeconds: 3600 },
  async handler(data, context, _tokenData) {
    const { fileData, fileType, fileName, stream } = data;

    let dataSizeMB: number;
    if (fileData.startsWith('data:')) {
      const base64Content = fileData.split(',')[1] || '';
      // 精确计算 base64 解码后大小：每 4 个字符对应 3 字节，减去填充字符数
      const padding = (base64Content.match(/=/g) || []).length;
      dataSizeMB = (base64Content.length * 3 - padding * 3) / 4 / 1024 / 1024;
    } else {
      dataSizeMB = new Blob([fileData]).size / 1024 / 1024;
    }
    if (dataSizeMB > MAX_FILE_SIZE_MB) {
      return errorResponse(`文件大小超过 ${MAX_FILE_SIZE_MB}MB 限制`, 413);
    }

    const isImage = fileType.startsWith('image/');
    const isPdf = fileType === 'application/pdf';
    const isText = fileType === 'text/plain';

    if ((isImage || isPdf) && !fileData.startsWith('data:')) {
      return errorResponse('文件内容应为 base64 data URL 格式', 400);
    }
    if (isText && fileData.startsWith('data:')) {
      return errorResponse('文本文件不应为 base64 编码', 400);
    }

    const llmConfig = resolveLLMConfig(context.request, context.env);
    if (!llmConfig) {
      return errorResponse('未配置 AI API，请在设置中填写或联系管理员', 503);
    }
    const { baseUrl, apiKey, model } = llmConfig;

    const messages = (isImage || isPdf)
      ? [
          { role: 'system', content: SYSTEM_PROMPTS.REPORT_ANALYZER_IMAGE },
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_PROMPTS.analyzeImage(fileName) },
              { type: 'image_url', image_url: { url: fileData } },
            ],
          },
        ]
      : [
          { role: 'system', content: SYSTEM_PROMPTS.REPORT_ANALYZER_TEXT },
          { role: 'user', content: USER_PROMPTS.analyzeText(fileName, fileData) },
        ];

    const response = await callLLM({
      baseUrl,
      apiKey,
      model,
      messages,
      stream: stream ?? false,
      temperature: 0.5,
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
