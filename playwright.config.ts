import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'msedge', viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 60000 },
})
