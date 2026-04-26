import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8787';

test.describe('Basic E2E Tests', () => {
  test('landing page loads', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Cloud Health|Health AI/);
  });

  test('health check endpoint returns ok', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('login page accessible', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});
