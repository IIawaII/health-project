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

  test('public config endpoint returns data', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/config/public`);
    expect(response.ok()).toBeTruthy();
  });

  test('security headers present on HTML response', async ({ page }) => {
    const response = await page.goto(BASE_URL);
    const headers = response?.headers() || {};

    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('unknown route redirects to landing page', async ({ page }) => {
    await page.goto(`${BASE_URL}/this-route-does-not-exist`);
    await page.waitForURL(/\/$/, { timeout: 5000 });
    expect(page.url()).toMatch(/\/$/);
  });
});
