import { expect, test, type Page } from '@playwright/test'

/** Shortcuts and clicks only work once the page has hydrated. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { useNuxtApp?: () => { isHydrating: boolean } }).useNuxtApp?.().isHydrating === false)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // A fresh browser profile: the tour has not been seen yet. Only on the first load, so a reload
    // inside a test sees what the test itself saved.
    if (sessionStorage.getItem('e2e-tour-reset')) return
    sessionStorage.setItem('e2e-tour-reset', '1')
    localStorage.removeItem('dblocal-tour')
    localStorage.setItem('dblocal-language-chosen', '1')
  })
})

test('the language is asked before the tour is offered', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('lang-reset')) { sessionStorage.setItem('lang-reset', '1'); localStorage.removeItem('dblocal-language-chosen') } })
  await page.goto('/')
  await hydrated(page)
  await expect(page.locator('[data-tour-start]')).toHaveCount(0)
  await page.locator('[data-language="pt-BR"]').click()
  await expect(page.locator('[data-tour-start]').first()).toContainText('Iniciar o tour')
  await page.reload()
  await hydrated(page)
  await expect(page.locator('[data-language-choice]')).toHaveCount(0)
})

test('F1 opens the help centre and the search finds a word from the body', async ({ page }) => {
  await page.goto('/')
  await hydrated(page)
  await page.keyboard.press('F1')
  await expect(page).toHaveURL(/\/help$/)
  await page.locator('[data-help-search]').fill('tunnel')
  await expect(page.locator('[data-help-hit]').first()).toContainText('Connections')
  await page.locator('[data-help-hit]').first().click()
  await expect(page).toHaveURL(/\/help\/connections/)
  await expect(page.locator('[data-help-article] h1')).toHaveText('Connections')
})

test('a hint opens its article in a drawer without leaving the page', async ({ page }) => {
  await page.goto('/')
  await hydrated(page)
  await page.getByRole('button', { name: 'New connection' }).first().click()
  await page.getByRole('tab', { name: 'SSL' }).click()
  await page.locator('[data-help-hint="connection.ssl"]').click()
  await page.locator('[data-help-learn-more]').click()
  await expect(page.locator('[data-help-drawer] h1')).toHaveText('Connections')
  await expect(page.locator('[data-help-drawer] [id="ssl"]')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('the tour runs on the demo from the first step to the last and does not come back', async ({ page }) => {
  await page.goto('/')
  await hydrated(page)
  await page.locator('[data-tour-start]').first().click()
  const steps = ['tables', 'grid', 'children', 'parents', 'related', 'record', 'trail', 'edit', 'safety', 'structure', 'routines', 'backup', 'sql', 'palette']
  for (const [i, id] of steps.entries()) {
    await expect(page.locator('[data-tour-step]')).toHaveAttribute('data-step', id, { timeout: 20_000 })
    await expect(page.locator('[data-tour-spotlight]')).toBeVisible({ timeout: 20_000 })
    if (i === 1) await page.keyboard.press('ArrowLeft') // keyboard: back
    if (i === 1) await expect(page.locator('[data-tour-step]')).toHaveAttribute('data-step', 'tables')
    if (i === 1) await page.keyboard.press('ArrowRight')
    if (i === 1) await expect(page.locator('[data-tour-step]')).toHaveAttribute('data-step', 'grid')
    await page.locator('[data-tour-next]').click()
  }
  await expect(page.locator('[data-tour-overlay]')).toHaveCount(0)

  await page.goto('/')
  await hydrated(page)
  await expect(page.locator('[data-tour-offer]')).toHaveCount(0)
})

test('Esc skips the tour and it is not offered again', async ({ page }) => {
  await page.goto('/')
  await hydrated(page)
  await page.locator('[data-tour-start]').first().click()
  await expect(page.locator('[data-tour-step]')).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-tour-overlay]')).toHaveCount(0)
  await page.goto('/')
  await hydrated(page)
  await expect(page.locator('[data-tour-offer]')).toHaveCount(0)
})

test('the shortcuts article lists the live registry', async ({ page }) => {
  await page.goto('/help/keyboard-shortcuts')
  await hydrated(page)
  await expect(page.locator('[data-help-shortcuts-table]')).toContainText('Command palette')
  await expect(page.locator('[data-help-shortcuts-table]')).toContainText('Open the help')
})
