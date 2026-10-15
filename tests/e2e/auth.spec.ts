import { expect, test } from '@playwright/test'

// Runs against the second web server of playwright.config.ts, started with DBLOCAL_PASSWORD.
test.use({ baseURL: 'http://127.0.0.1:5598' })
test.skip(!process.env.E2E_BUILT, 'needs the second server, started only with E2E_BUILT=1')

test('pages redirect to /login and the API answers 401 without a session', async ({ page, request }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  expect((await request.get('/api/connections')).status()).toBe(401)
  expect((await request.get('/api/health')).status()).toBe(200)
})

test('a wrong password is refused and the right one opens the app', async ({ page }) => {
  await page.goto('/login')
  await page.getByPlaceholder('Password').fill('nope')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Invalid password')).toBeVisible()

  await page.getByPlaceholder('Password').fill('e2e-secret')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Connections', exact: true })).toBeVisible()
})
