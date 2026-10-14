import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '#shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  test: { include: ['tests/unit/**/*.test.ts', 'server/**/*.test.ts', 'shared/**/*.test.ts'], environment: 'node' },
})
