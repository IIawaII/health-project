/**
 * Cloudflare Turnstile 验证工具
 * 支持结果缓存，避免对同一 token 重复调用 Cloudflare API
 */

import type { AppContext } from './handler';

interface TurnstileResult {
  success: boolean;
  error?: string;
}

interface CachedResult {
  valid: boolean;
  expiry: number;
}

// 内存缓存：避免对同一 token 重复调用 Cloudflare API
// Workers isolate 复用期间有效，TTL 5 分钟，最多缓存 50 条
const verifiedTokens = new Map<string, CachedResult>();

function cleanupExpiredCache(): void {
  if (verifiedTokens.size <= 50) return;
  const now = Date.now();
  for (const [key, val] of verifiedTokens) {
    if (val.expiry <= now) verifiedTokens.delete(key);
  }
  if (verifiedTokens.size > 50) {
    const keysToDelete = Array.from(verifiedTokens.keys()).slice(0, verifiedTokens.size - 50);
    for (const key of keysToDelete) verifiedTokens.delete(key);
  }
}

export async function verifyTurnstile(
  token: string,
  secretKey: string,
  ip?: string
): Promise<TurnstileResult> {
  // 1. 检查缓存
  const cached = verifiedTokens.get(token);
  if (cached && cached.expiry > Date.now()) {
    return { success: cached.valid };
  }

  const formData = new URLSearchParams();
  formData.append('secret', secretKey);
  formData.append('response', token);
  if (ip) formData.append('remoteip', ip);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = await response.json<{ success?: boolean; 'error-codes'?: string[] }>();
    const success = data.success === true;

    // 2. 写入缓存
    verifiedTokens.set(token, { valid: success, expiry: Date.now() + 5 * 60 * 1000 });
    cleanupExpiredCache();

    return {
      success,
      error: data['error-codes']?.join(', '),
    };
  } catch {
    return { success: false, error: '网络错误' };
  }
}

/**
 * 通用 Turnstile 校验辅助函数
 * 返回 null 表示验证通过，返回 string 表示错误信息
 */
export async function validateTurnstile(
  context: AppContext,
  token: string
): Promise<string | null> {
  const clientIP = context.req.header('CF-Connecting-IP') || undefined;
  const result = await verifyTurnstile(token, context.env.TURNSTILE_SECRET_KEY, clientIP);
  if (result.success) return null;
  return result.error ? `人机验证失败: ${result.error}` : '人机验证失败，请重试';
}
