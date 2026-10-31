import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 只覆盖前端外壳与路由（后端契约由 nibe 的 HTTP 集成测试负责）。
 * 首次运行前需 `npx playwright install chromium`。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5273',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5273',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
