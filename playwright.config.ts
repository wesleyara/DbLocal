import { defineConfig } from '@playwright/test'

const port = 5599

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}`, channel: process.env.CI ? undefined : 'chrome' },
  webServer: {
    command: 'pnpm exec nuxt dev',
    env: {
      DBLOCAL_PORT: String(port),
      DBLOCAL_DATA_DIR: '.data/e2e',
      DBLOCAL_PASSWORD: '',
    },
    url: `http://127.0.0.1:${port}/api/auth/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
