import { z } from 'zod';
import { jsonResponse, errorResponse, parseLLMResult } from '../../utils/response';
import { callLLM, createStreamResponse, resolveLLMConfig } from '../../utils/llm';
import { SYSTEM_PROMPTS, USER_PROMPTS, buildSystemPrompt } from '../../utils/prompts';
import { createAIHandler } from '../../utils/handler';
import { getLogger } from '../../utils/logger';
import { t } from '../../../shared/i18n/server';

const logger = getLogger('Analyze')

const MAX_FILE_SIZE_MB = 5;
const MAX_TEXT_CONTENT_LENGTH = 500 * 1024;

const analyzeSchema = z.object({
  fileData: z.string().min(1, t('ai.validation.fileRequired', '请上传文件')).max(15 * 1024 * 1024, t('ai.validation.fileTooLarge', '文件数据过大')),
  fileType: z.enum(['image/png', 'image/jpeg', 'image/jpg', 'text/plain'], {
    message: t('ai.validation.unsupportedFileType', '不支持的文件类型，仅支持 PNG、JPG、TXT'),
  }),
  fileName: z.string().min(1, t('ai.validation.fileNameRequired', '文件名不能为空')).max(255, t('ai.validation.fileNameTooLong', '文件名过长')),
  stream: z.boolean().optional(),
});

export const onRequestPost = createAIHandler({
  schema: analyzeSchema,
  rateLimit: { key: 'analyze', limit: 20, windowSeconds: 3600 },
  action: 'analyze',
  async handler(data, context, _tokenData) {
    const { fileData, fileType, fileName, stream } = data;

    const isText = fileType === 'text/plain';
    if (isText && fileData.length > MAX_TEXT_CONTENT_LENGTH) {
      logger.warn('Text content exceeds limit', {
        fileName,
        contentLength: fileData.length,
        maxLength: MAX_TEXT_CONTENT_LENGTH,
      });
      return errorResponse(t('ai.errors.textContentTooLarge', '文本内容超过 {{max}}KB 限制，请缩短后重试', { max: MAX_TEXT_CONTENT_LENGTH / 1024 }), 413);
    }

    let dataSizeMB: number;
    if (fileData.startsWith('data:')) {
      const base64Content = fileData.split(',')[1] || '';
      const padding = (base64Content.match(/=/g) || []).length;
      dataSizeMB = (base64Content.length * 3 - padding * 3) / 4 / 1024 / 1024;
    } else {
      dataSizeMB = new Blob([fileData]).size / 1024 / 1024;
    }
    if (dataSizeMB > MAX_FILE_SIZE_MB) {
      return errorResponse(t('ai.errors.fileSizeExceeded', '文件大小超过 {{max}}MB 限制', { max: MAX_FILE_SIZE_MB }), 413);
    }

    const isImage = fileType.startsWith('image/');

    if (isImage && !fileData.startsWith('data:')) {
      return errorResponse(t('ai.errors.invalidFileFormat', '文件内容应为 base64 data URL 格式'), 400);
    }
    if (isText && fileData.startsWith('data:')) {
      return errorResponse(t('ai.errors.textNotBase64', '文本文件不应为 base64 编码'), 400);
    }

    const llmConfig = await resolveLLMConfig(context.req.raw, context.env, _tokenData);
    if (!llmConfig) {
      return errorResponse(t('ai.errors.notConfigured', '未配置 AI API，请在设置中填写或联系管理员'), 503);
    }
    const { baseUrl, apiKey, model } = llmConfig;

    const messages = isImage
      ? [
          { role: 'system', content: buildSystemPrompt(SYSTEM_PROMPTS.REPORT_ANALYZER_IMAGE, context.req.raw) },
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_PROMPTS.analyzeImage(fileName) },
              { type: 'image_url', image_url: { url: fileData } },
            ],
          },
        ]
      : [
          { role: 'system', content: buildSystemPrompt(SYSTEM_PROMPTS.REPORT_ANALYZER_TEXT, context.req.raw) },
          { role: 'user', content: USER_PROMPTS.analyzeText(fileName, fileData) },
        ];

    try {
      const response = await callLLM({
        baseUrl,
        apiKey,
        model,
        messages,
        stream: stream ?? false,
        temperature: 0.5,
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
    } catch (err) {
      logger.error('Unexpected analyze error', { error: err instanceof Error ? err.message : String(err) });
      return errorResponse(t('ai.errors.serviceUnavailable', '分析服务暂时不可用，请稍后重试或尝试上传较小的文件'), 502);
    }
  },
});
