#!/usr/bin/env node
// Regenerates the screenshots used by the help articles, in both themes, on the demo database.
//
//   pnpm help:shots                       (a DbLocal server must be running)
//   DBLOCAL_URL=http://127.0.0.1:5555 pnpm help:shots
//
// Files land in public/help/shots/<name>-dark.png and <name>-light.png; articles reference them as
// `![alt](/help/shots/<name>-{theme}.png)`, and the help page picks the one for the current theme.
// Only the demo database is opened: nothing of the user's own connections is read or shown.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public/help/shots')
const base = (process.env.DBLOCAL_URL || 'http://127.0.0.1:5555').replace(/\/$/, '')
const THEMES = ['dark', 'light']
const VIEWPORT = { width: 1280, height: 720 }

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

async function main() {
  mkdirSync(outDir, { recursive: true })
  const demo = await fetch(`${base}/api/demo`, { method: 'POST' })
  if (!demo.ok) throw new Error(`POST /api/demo failed (${demo.status}). Is DbLocal running at ${base}?`)
  const { id } = await demo.json()
  const schema = 'main'
  const at = (path) => `${base}/c/${id}/${schema}${path}`

  const browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' })
  try {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US', colorScheme: theme })
      await context.addInitScript((t) => {
        localStorage.setItem('dblocal-ui', JSON.stringify({ theme: t }))
        // The shots are about the app, not the first-use offer.
        localStorage.setItem('dblocal-tour', JSON.stringify({ status: 'skipped', step: 0, connectionId: null, schema: 'main' }))
      }, theme)
      const page = await context.newPage()
      const shot = async (name) => {
        await page.waitForTimeout(400)
        await page.screenshot({ path: join(outDir, `${name}-${theme}.png`) })
        console.log(`${name}-${theme}.png`)
      }
      const ready = async () => {
        // Shortcuts and clicks only work once the page has hydrated.
        await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false)
      }

      // data grid with foreign key chips and relation counts
      await page.goto(at('/t/orders'))
      await ready()
      await page.locator('[data-fk-chip]').first().waitFor()
      await shot('grid')

      // record panel
      await page.goto(at(`/t/orders?r=${b64url({ k: { id: 1 } })}`))
      await page.locator('[data-record-panel]').waitFor()
      await page.locator('[data-record-panel] [data-relation-count], [data-record-panel] button').first().waitFor()
      await shot('record')

      // SQL editor with a result
      await page.goto(at('/t/users'))
      await ready()
      await page.locator('[data-new-query]').click()
      await page.locator('[data-sql-editor]').click()
      await page.keyboard.insertText(
        'select u.name, count(o.id) as orders, round(sum(o.total), 2) as spent\nfrom users u join orders o on o.user_id = u.id\ngroup by u.id order by spent desc limit 10',
      )
      await page.locator('[data-run]').click()
      await page.locator('[data-results]').waitFor()
      await shot('sql-editor')

      // schema diagram
      await page.goto(at('/erd'))
      await page.locator('[data-table="users"]').waitFor({ timeout: 20_000 })
      await shot('erd')

      // command palette
      await page.goto(at(''))
      await ready()
      await page.keyboard.press('Control+k')
      await page.getByRole('dialog').waitFor()
      await page.keyboard.type('ord')
      await shot('palette')

      await context.close()
    }
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
