import { defineConfig } from '@playwright/test'

const port = 5599
const authPort = 5598
const command = process.env.E2E_BUILT ? 'node .output/server/index.mjs' : 'pnpm exec nuxt dev'

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // E2E_BUILT=1 runs the production build (`pnpm build` first). It does not clash with a dev server
      // already running in this folder, which `nuxt dev` refuses.
      command,
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
    ...(process.env.E2E_BUILT ? [authServer()] : []),
  ],
})

function authServer() {
  return {
    // Second instance with a password, for the login flow. Built output only: two `nuxt dev` in one
    // folder clash, so locally this one needs E2E_BUILT=1 (otherwise auth.spec.ts is skipped).
    command: 'node .output/server/index.mjs',
    env: {
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: String(authPort),
      DBLOCAL_PORT: String(authPort),
      DBLOCAL_DATA_DIR: '.data/e2e-auth',
      DBLOCAL_PASSWORD: 'e2e-secret',
    },
    url: `http://127.0.0.1:${authPort}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  }
}
