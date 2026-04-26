import { z } from 'zod';
import { jsonResponse, errorResponse, parseLLMResult } from '../../utils/response';
import { callLLM, createStreamResponse, resolveLLMConfig } from '../../utils/llm';
import { SYSTEM_PROMPTS, USER_PROMPTS } from '../../utils/prompts';
import { createAIHandler } from '../../utils/handler';

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
  action: 'analyze',
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

    const llmConfig = resolveLLMConfig(context.req.raw, context.env);
    if (!llmConfig) {
      return errorResponse('未配置 AI API，请在设置中填写或联系管理员', 503);
    }
    const { baseUrl, apiKey, model } = llmConfig;

    // PDF 文件过大时，截断 base64 内容以避免 Worker CPU/内存超限导致 502
    let processedFileData = fileData;
    let isPdfTruncated = false;
    if (isPdf && fileData.length > 500_000) {
      // 保留 data:前缀 和 前约 300KB 的 base64 内容（约 225KB 原始数据）
      const commaIndex = fileData.indexOf(',');
      if (commaIndex === -1) {
        return errorResponse('PDF 文件格式不正确，缺少 data URL 分隔符', 400);
      }
      const prefix = fileData.slice(0, commaIndex + 1);
      processedFileData = prefix + fileData.slice(prefix.length, prefix.length + 400_000);
      isPdfTruncated = true;
      console.warn(`[analyze] PDF truncated from ${fileData.length} to ${processedFileData.length} chars`);
    }

    // PDF 不支持 image_url 类型，需要转为文本提示或提取内容描述
    const messages = isImage
      ? [
          { role: 'system', content: SYSTEM_PROMPTS.REPORT_ANALYZER_IMAGE },
          {
            role: 'user',
            content: [
              { type: 'text', text: USER_PROMPTS.analyzeImage(fileName) },
              { type: 'image_url', image_url: { url: processedFileData } },
            ],
          },
        ]
      : isPdf
        ? [
            { role: 'system', content: SYSTEM_PROMPTS.REPORT_ANALYZER_TEXT },
            { role: 'user', content: USER_PROMPTS.analyzeText(fileName, `[PDF 文件: ${fileName}，大小 ${dataSizeMB.toFixed(2)}MB]\n\n注：当前版本暂不支持直接解析 PDF 内容，请上传文本格式（.txt）或截图（.png/.jpg）进行分析。`) },
          ]
        : [
            { role: 'system', content: SYSTEM_PROMPTS.REPORT_ANALYZER_TEXT },
            { role: 'user', content: USER_PROMPTS.analyzeText(fileName, fileData) },
          ];

    // 如果 PDF 被截断，在系统提示中补充说明，避免模型基于不完整内容给出误导性结论
    if (isPdf && isPdfTruncated) {
      const systemMsg = messages.find((m) => m.role === 'system');
      if (systemMsg && typeof systemMsg.content === 'string') {
        systemMsg.content += '\n\n【重要提示】用户上传的 PDF 文件因体积过大已被截断，仅提供了部分内容。请基于现有片段进行分析，并在结论中明确说明"分析基于文件的部分内容，建议上传文本格式或截图以获取完整解读"。';
      }
    }

    try {
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
        console.error('[analyze] LLM request failed:', err);
        return errorResponse(`模型请求失败: ${err.slice(0, 200)}`, 502);
      }

      if (stream) {
        return createStreamResponse(response);
      }

      const responseData = await response.json();
      const result = parseLLMResult(responseData);

      return jsonResponse({ result }, 200);
    } catch (err) {
      console.error('[analyze] Unexpected error:', err);
      return errorResponse('分析服务暂时不可用，请稍后重试或尝试上传较小的文件', 502);
    }
  },
});
