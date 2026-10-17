import { expect, test } from '@playwright/test'

test('home renders the app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('DbLocal').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
})

test('theme persists after reload', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() =>
    localStorage.setItem('dblocal-ui', JSON.stringify({ theme: 'light' })),
  )
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('locale cookie switches the UI to Portuguese', async ({ page, context }) => {
  await context.addCookies([{ name: 'dblocal_locale', value: 'pt-BR', url: 'http://127.0.0.1:5599' }])
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Conexões' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
})

test('theme and language from the settings dialog apply without a reload', async ({ page }) => {
  await page.goto('/')
  // A click before hydration hits the server-rendered button, which has no listener yet.
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
  await page.locator('[data-open-settings]').click()
  const settings = page.locator('[data-settings]')

  await settings.getByRole('radio', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await settings.getByRole('radio', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await settings.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'Português' }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await expect(settings.getByRole('radio', { name: 'Escuro' })).toBeVisible()
})

test('the home page hydrates without mismatches', async ({ page }) => {
  const problems: string[] = []
  page.on('console', (msg) => {
    if (/hydration|intlify/i.test(msg.text())) problems.push(msg.text())
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Connections' })).toBeVisible()
  expect(problems).toEqual([])
})
