import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 配置。
 *
 * 刻意不写 `channel: 'msedge'`：那会让测试只能在装了 Edge 的 Windows 上跑，
 * CI（ubuntu）必然失败。默认使用 Playwright 自带的 Chromium，跨平台一致。
 * 本地想跑系统浏览器时用 `PW_CHANNEL=msedge npm run test:e2e` 覆盖。
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  webServer: {
    command: 'npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
