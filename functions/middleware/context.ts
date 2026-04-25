/**
 * 创建 EventContext 兼容对象
 * 将 Hono 的 Request / Env 桥接到 Pages Functions 风格的 EventContext
 */

import type { Env } from '../lib/env'

export function createContext(
  request: Request,
  env: Env,
  executionCtx?: ExecutionContext
): EventContext<Env, string, Record<string, unknown>> {
  return {
    request,
    env,
    params: {},
    data: {},
    next: () => Promise.resolve(new Response('Not Found', { status: 404 })),
    waitUntil: executionCtx ? (promise) => executionCtx.waitUntil(promise) : () => {},
    passThroughOnException: executionCtx ? () => executionCtx.passThroughOnException() : () => {},
    functionPath: '',
  } as EventContext<Env, string, Record<string, unknown>>
}
