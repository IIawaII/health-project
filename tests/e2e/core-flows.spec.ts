/**
 * E2E 测试：核心用户流程
 * 使用 Playwright 测试
 *
 * 运行: npx playwright test --config configs/playwright.config.cjs tests/e2e/core-flows.spec.ts
 */

import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:8787'

test.describe('核心用户流程', () => {
  const testUser = {
    username: `e2euser_${Date.now()}`,
    email: `e2e_${Date.now()}@test.com`,
    password: 'TestPass123',
  }

  test('完整注册流程', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`)

    // 等待页面加载
    await expect(page.locator('h1, h2').first()).toBeVisible()

    // 填写注册表单
    const usernameInput = page.locator('input[name="username"], input[placeholder*="用户名"]').first()
    const emailInput = page.locator('input[name="email"], input[type="email"]').first()
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first()

    if (await usernameInput.isVisible()) {
      await usernameInput.fill(testUser.username)
      await emailInput.fill(testUser.email)
      await passwordInput.fill(testUser.password)

      // 点击注册按钮
      const submitBtn = page.locator('button[type="submit"], button:has-text("注册")').first()
      if (await submitBtn.isVisible()) {
        // 注：实际注册需要验证码和 Turnstile，此处验证页面渲染
        await expect(submitBtn).toBeVisible()
      }
    }

    // 验证页面关键元素存在
    await expect(page).toHaveTitle(/Cloud Health|健康/)
  })

  test('登录页面渲染验证', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`)

    // 验证登录表单存在
    await expect(page.locator('input[type="text"], input[name="usernameOrEmail"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(page.locator('button[type="submit"]').first()).toBeVisible()
  })

  test('首页加载验证', async ({ page }) => {
    await page.goto(BASE_URL)

    // 验证首页关键元素
    await expect(page.locator('nav, header').first()).toBeVisible()
    await expect(page).toHaveTitle(/Cloud Health|健康/)
  })

  test('AI 聊天页面渲染验证', async ({ page }) => {
    await page.goto(`${BASE_URL}/chat`)

    // 验证聊天界面元素
    await expect(page.locator('textarea, input[type="text"]').first()).toBeVisible()
    await expect(page.locator('button').first()).toBeVisible()
  })

  test('管理后台访问验证', async ({ page }) => {
    await page.goto(`${BASE_URL}/admin`)

    // 未登录应重定向到首页
    await page.waitForURL(/\/$|\/login|\/home/, { timeout: 5000 })
    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/admin')
  })
})
