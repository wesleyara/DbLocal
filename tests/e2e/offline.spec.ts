import { expect, test } from '@playwright/test'

/** A Postgres connection to a port where nothing listens: every schema read fails with `network`. */
let connectionId = ''

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/connections', {
    data: { name: 'E2E offline', dialect: 'postgres', host: '127.0.0.1', port: 9, user: 'x', database: 'x', environment: 'local' },
  })
  expect(res.ok()).toBeTruthy()
  connectionId = (await res.json()).id
})

test.afterAll(async ({ request }) => {
  if (connectionId) await request.delete(`/api/connections/${connectionId}`)
})

for (const [name, path] of [
  ['a table', 't/users'],
  ['the diagram', 'erd'],
] as const) {
  test(`${name} of a database that is down shows the error inside the app, with a retry`, async ({ page }) => {
    const response = await page.goto(`/c/${connectionId}/public/${path}`)
    // Not Nuxt's error page: the page answers 200 and the shell is there.
    expect(response?.status()).toBe(200)
    await expect(page.locator('[data-open-palette]').or(page.locator('[data-new-query]')).first()).toBeAttached()
    const unavailable = page.locator('[data-connection-unavailable]')
    await expect(unavailable).toBeVisible()
    await expect(unavailable).toContainText(/127\.0\.0\.1:9|reach|alcan/i)

    await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
    await page.locator('[data-unavailable-retry]').click()
    await expect(unavailable).toBeVisible()
    await page.locator('[data-unavailable-home]').click()
    await expect(page).toHaveURL(/\/$/)
  })
}
