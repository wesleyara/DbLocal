import { expect, test } from '@playwright/test'

test('home renders the app shell', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('DbLocal').first()).toBeVisible()
  await expect(page.getByText('No table selected')).toBeVisible()
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
  await expect(page.getByText('Nenhuma tabela selecionada')).toBeVisible()
})
