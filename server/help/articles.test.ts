import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractHeadings, HELP_LOCALES, searchArticles } from '#shared/help'
import { HELP_EMPTY_STATES, HELP_HINTS } from '#shared/help-hints'
import { createHelpLibrary, type HelpFiles } from './articles'
import { renderArticle } from './render'

const ROOT = join(process.cwd(), 'content/help')
const files: HelpFiles = {}
for (const locale of HELP_LOCALES) {
  for (const file of readdirSync(join(ROOT, locale)).filter((f) => f.endsWith('.md'))) {
    files[`${locale}:${file}`] = readFileSync(join(ROOT, locale, file), 'utf8')
  }
}
const library = createHelpLibrary(files)
const slugsOf = (locale: string) => library.list(locale).map((a) => a.slug).sort()
const messages = (locale: string) => JSON.parse(readFileSync(`i18n/locales/${locale}.json`, 'utf8'))

describe('help articles', () => {
  it('exist in every locale with the same slugs', () => {
    const [first, ...rest] = HELP_LOCALES
    const own = (l: string) =>
      readdirSync(join(ROOT, l))
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/\.md$/, ''))
        .sort()
    for (const l of rest) expect(own(l), `${l} vs ${first}`).toEqual(own(first))
    expect(own('en')).toContain('getting-started')
  })

  it('group into the same number of categories and keep the same order in every locale', () => {
    const shape = (l: string) => {
      const metas = library.list(l)
      return {
        categories: new Set(metas.map((m) => m.category)).size,
        order: metas.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)).map((m) => m.slug),
      }
    }
    expect(shape('pt-BR')).toEqual(shape('en'))
  })

  it('have complete frontmatter and related links that exist', () => {
    for (const locale of HELP_LOCALES) {
      const known = new Set(slugsOf(locale))
      for (const meta of library.list(locale)) {
        expect(meta.title, `${locale}/${meta.slug}`).not.toBe('')
        expect(meta.description, `${locale}/${meta.slug}`).not.toBe('')
        for (const r of meta.related) expect(known.has(r), `${locale}/${meta.slug} -> ${r}`).toBe(true)
      }
    }
  })

  it('give every heading a unique id', () => {
    for (const [key, raw] of Object.entries(files)) {
      const ids = extractHeadings(raw).map((h) => h.id)
      expect(new Set(ids).size, key).toBe(ids.length)
    }
  })

  it('point every HelpHint and empty-state link at an existing slug and anchor, with text in both locales', () => {
    const refs = [...Object.entries(HELP_HINTS), ...Object.entries(HELP_EMPTY_STATES)] as [string, { slug: string; anchor: string }][]
    for (const locale of HELP_LOCALES) {
      for (const [id, ref] of refs) {
        const article = library.get(locale, ref.slug)
        expect(article, `${locale}: ${id} -> ${ref.slug}`).not.toBeNull()
        expect(article!.headings.map((h) => h.id), `${locale}: ${id} -> ${ref.slug}#${ref.anchor}`).toContain(ref.anchor)
      }
      // Hint ids are dotted paths (`connection.ssl`), the same way `t('help.hints.' + id + '.title')` resolves them.
      const hints = messages(locale).help.hints as Record<string, unknown>
      const lookup = (path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], hints)
      for (const id of Object.keys(HELP_HINTS)) {
        expect(lookup(`${id}.title`), `${locale}: help.hints.${id}.title`).toBeTruthy()
        expect(lookup(`${id}.text`), `${locale}: help.hints.${id}.text`).toBeTruthy()
      }
    }
  })

  it('find articles by a word from the body', () => {
    const hits = searchArticles(library.index('en'), 'tunnel')
    expect(hits.map((h) => h.slug)).toContain('connections')
    expect(hits[0]!.snippet.toLowerCase()).toContain('tunnel')
  })

  it('falls back to English for an unknown locale', () => {
    expect(library.locale('fr')).toBe('en')
    expect(library.locale('pt')).toBe('pt-BR')
    expect(library.get('fr', 'getting-started')?.title).toBeTruthy()
  })
})

describe('renderArticle', () => {
  it('renders headings with anchors, copyable code and callouts', () => {
    const html = renderArticle('# Title\n\n## Set up\n\ntext with <kbd>F1</kbd>\n\n> [!WARNING]\n> careful\n\n```sql\nselect 1\n```\n')
    expect(html).toContain('<h1 id="title">')
    expect(html).toContain('id="set-up"')
    expect(html).toContain('href="#set-up"')
    expect(html).toContain('help-callout-warning')
    expect(html).toContain('data-help-copy')
    expect(html).toContain('<kbd>F1</kbd>')
  })

  it('keeps a plain blockquote and marks themed images', () => {
    const html = renderArticle('> quoted\n\n![shot](/help/x-{theme}.png)\n')
    expect(html).toContain('<blockquote>')
    expect(html).toContain('data-help-src="/help/x-{theme}.png"')
  })
})
