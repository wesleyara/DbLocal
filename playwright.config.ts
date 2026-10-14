import { defineConfig } from '@playwright/test'

const port = 5599

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}`, channel: process.env.CI ? undefined : 'chrome' },
  webServer: {
    // E2E_BUILT=1 runs the production build (`pnpm build` first). It does not clash with a dev server
    // already running in this folder, which `nuxt dev` refuses.
    command: process.env.E2E_BUILT ? 'node .output/server/index.mjs' : 'pnpm exec nuxt dev',
    env: {
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(port),
      DBLOCAL_PORT: String(port),
      DBLOCAL_DATA_DIR: '.data/e2e',
      DBLOCAL_PASSWORD: '',
    },
    url: `http://127.0.0.1:${port}/api/auth/status`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
