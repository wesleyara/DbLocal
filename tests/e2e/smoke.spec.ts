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

test('language and theme selectors work from the topbar without a reload', async ({ page }) => {
  await page.goto('/')
  const [theme, language] = await page.getByRole('combobox').all()

  await theme!.click()
  await page.getByRole('option', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(theme!).toHaveText('Dark')

  await language!.click()
  await page.getByRole('option', { name: 'Português' }).click()
  await expect(page.getByRole('heading', { name: 'Conexões' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  // The trigger text follows the locale too (it used to keep the old label until a reload).
  await expect(theme!).toHaveText('Escuro')
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
