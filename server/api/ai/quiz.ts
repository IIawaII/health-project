import { z } from 'zod';
import { jsonResponse, errorResponse } from '../../utils/response';
import { checkRateLimit } from '../../utils/rateLimit';
import { callLLMText, resolveLLMConfig } from '../../utils/llm';
import { SYSTEM_PROMPTS, USER_PROMPTS, buildSystemPrompt } from '../../utils/prompts';
import { createAIHandler } from '../../utils/handler';
import { t } from '../../../shared/i18n/server';

function extractJsonObject(str: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return str.slice(start, i + 1);
      }
    }
  }
  return null;
}

const questionSchema = z.object({
  question: z.string().min(1, t('ai.validation.questionRequired', '题目内容不能为空')).max(500, t('ai.validation.questionTooLong', '题目内容过长')),
  options: z.array(z.string().min(1)).min(2, t('ai.validation.minOptions', '选项至少2个')).max(6, t('ai.validation.maxOptions', '选项最多6个')),
  correctAnswer: z.number().int().min(0).optional(),
  explanation: z.string().max(2000, t('ai.validation.explanationTooLong', '解析内容过长')).optional(),
});

const quizSchema = z.object({
  mode: z.enum(['generate', 'grade'], { message: t('ai.validation.quizModeInvalid', 'mode 必须是 generate 或 grade') }),
  category: z.string().max(50).optional(),
  difficulty: z.string().max(20).optional(),
  questions: z.array(questionSchema).max(100, t('ai.validation.tooManyQuestions', '题目数量不能超过100')).optional(),
  userAnswers: z.array(z.number().int().min(0)).max(100).optional(),
}).refine((data) => {
  if (data.mode === 'grade') {
    return data.questions !== undefined && data.userAnswers !== undefined;
  }
  return true;
}, { message: t('ai.validation.gradeRequiresData', '评分模式必须提供 questions 和 userAnswers'), path: ['mode'] });

export const onRequestPost = createAIHandler({
  schema: quizSchema,
  action: 'quiz',
  async handler(data, context, tokenData) {
    const { mode, category, difficulty, questions, userAnswers } = data;

    if (mode === 'generate') {
      const rateLimit = await checkRateLimit({
        env: context.env,
        key: `ai:${tokenData.userId}:quiz`,
        limit: 20,
        windowSeconds: 3600,
      });
      if (!rateLimit.allowed) {
        return errorResponse(t('ai.errors.quizRateLimited', '题目生成请求过于频繁，请稍后再试'), 429, { 'Retry-After': String(rateLimit.resetAt - Math.floor(Date.now() / 1000)) });
      }

      const llmConfig = await resolveLLMConfig(context.req.raw, context.env, tokenData);
      if (!llmConfig) {
        return errorResponse(t('ai.errors.notConfigured', '未配置 AI API，请在设置中填写或联系管理员'), 503);
      }
      const { baseUrl, apiKey, model } = llmConfig;

      const content = await callLLMText({
        baseUrl,
        apiKey,
        model,
        messages: [
          { role: 'system', content: buildSystemPrompt(SYSTEM_PROMPTS.QUIZ_GENERATOR, context.req.raw) },
          { role: 'user', content: USER_PROMPTS.generateQuiz(category, difficulty) },
        ],
        temperature: 0.8,
        max_tokens: 3000,
        ssrfCache: context.env.SSRF_CACHE,
      });

      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch {
        const jsonStr = extractJsonObject(content);
        if (jsonStr) {
          parsed = JSON.parse(jsonStr);
        } else {
          throw new Error(t('ai.errors.parseQuizFailed', '无法解析题目数据'));
        }
      }

      return jsonResponse(parsed, 200);
    }

    if (mode === 'grade' && questions && userAnswers) {
      if (questions.length === 0) {
        return errorResponse(t('ai.errors.emptyQuizData', '题目数据为空，无法评分'), 400);
      }
      if (userAnswers.length !== questions.length) {
        return errorResponse(t('ai.errors.answerMismatch', '答题数量与题目数量不匹配'), 400);
      }

      for (let i = 0; i < questions.length; i++) {
        if (typeof questions[i].correctAnswer !== 'number') {
          return errorResponse(t('ai.errors.missingCorrectAnswer', '第 {{index}} 题缺少正确答案数据', { index: i + 1 }), 400);
        }
      }

      let correctCount = 0;
      const results = questions.map((q, idx) => {
        const isCorrect = userAnswers[idx] === q.correctAnswer;
        if (isCorrect) correctCount++;
        return {
          question: q.question,
          userAnswer: userAnswers[idx],
          correctAnswer: q.correctAnswer!,
          isCorrect,
          explanation: q.explanation || '',
        };
      });

      const score = Math.round((correctCount / questions.length) * 100);

      let comment = '';
      if (score >= 90) comment = t('ai.quiz.commentExcellent', '太棒了！你的健康知识储备非常丰富，继续保持！');
      else if (score >= 70) comment = t('ai.quiz.commentGood', '不错哦！你对健康知识有较好的了解，还有提升空间。');
      else if (score >= 50) comment = t('ai.quiz.commentFair', '还可以！建议多关注健康知识，提升健康素养。');
      else comment = t('ai.quiz.commentNeedsWork', '需要加油！建议你多学习一些基础健康知识，关爱自己的身体。');

      return jsonResponse({
        score,
        correctCount,
        total: questions.length,
        comment,
        results,
      }, 200);
    }

    return errorResponse(t('ai.errors.invalidParams', '无效的请求参数'), 400);
  },
});
