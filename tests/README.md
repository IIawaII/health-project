# 测试目录说明

本目录包含项目的单元测试和集成测试，使用 [Vitest](https://vitest.dev/) 作为测试框架。

## 目录结构

```
test/
├── setup.ts                     # 测试环境初始化（Web Crypto API  polyfill）
├── types.d.ts                   # 测试专用类型声明（Cloudflare Workers 类型）
├── README.md                    # 本文件
├── auth.test.ts                 # 认证令牌管理测试
├── concurrency.test.ts          # 高并发场景测试（限流、验证码原子消费）
├── crypto.test.ts               # 密码哈希与令牌生成测试
├── db.test.ts                   # D1 数据库操作测试
├── llm.test.ts                  # LLM URL SSRF 防护测试
├── load.test.ts                 # 压力测试（登录/验证码/AI 分析限流）
├── rateLimit.test.ts            # 速率限制工具测试
├── response.test.ts             # 响应工具测试
└── turnstile.test.ts            # Cloudflare Turnstile 验证测试
```

## 运行测试

```bash
# 运行所有测试
npm test

# 运行单个测试文件
npx vitest run test/auth.test.ts

# 监视模式（开发时使用）
npm run test:watch

# 压力测试（会调用外部 LLM API，请谨慎运行）
npx vitest run test/load.test.ts
```

## 测试分类

### 单元测试

| 文件 | 测试目标 | 说明 |
|------|---------|------|
| `auth.test.ts` | `functions/lib/auth.ts` | Access/Refresh Token 的保存、验证、删除、批量撤销 |
| `crypto.test.ts` | `functions/lib/crypto.ts` | PBKDF2 密码哈希、密码验证、随机令牌生成 |
| `db.test.ts` | `functions/lib/db.ts` | 用户 CRUD、验证码存取、冷却时间检查 |
| `rateLimit.test.ts` | `functions/lib/rateLimit.ts` | 固定窗口限流算法、限流键构建 |
| `response.test.ts` | `functions/lib/response.ts` | JSON 响应、错误响应、LLM 结果解析 |
| `turnstile.test.ts` | `functions/lib/turnstile.ts` | 人机验证缓存、网络错误处理 |

### 集成/场景测试

| 文件 | 测试目标 | 说明 |
|------|---------|------|
| `llm.test.ts` | `functions/lib/llm.ts` | SSRF 防护 URL 校验逻辑 |
| `concurrency.test.ts` | 多个模块 | KV 竞态条件、D1 原子消费、令牌并发验证 |
| `load.test.ts` | 多个模块 | 高并发登录/验证码/AI 分析限流压力测试 |

## Mock 实现

测试中使用自定义 Mock 类模拟 Cloudflare Workers 运行时：

- **`MockKV` / `MockKVNamespace`** — 模拟 `KVNamespace`，基于内存 Map 实现
- **`MockD1` / `MockD1Database`** — 模拟 `D1Database`，基于内存表结构实现
- **`MockD1PreparedStatement`** — 模拟 `D1PreparedStatement`，支持基础 SQL 解析

## 注意事项

1. **类型支持**：测试文件依赖 Cloudflare Workers 全局类型（`KVNamespace`、`D1Database`、`EventContext` 等），通过 `test/types.d.ts` 引入。

2. **Web Crypto**：`test/setup.ts` 在 Node 环境中注入 `crypto` 全局对象，确保密码哈希和令牌生成能正常运行。

3. **压力测试**：`load.test.ts` 中的测试会真实调用外部 LLM API，请在本地开发环境谨慎运行，避免消耗 API 额度。

4. **并发测试**：`concurrency.test.ts` 中的竞态条件测试用于量化问题严重程度，MockKV 的 get/put 不是原子操作，实际超发数量可能因运行时环境而异。
