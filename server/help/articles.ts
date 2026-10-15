import {
  extractHeadings,
  HELP_LOCALES,
  metaOf,
  parseArticle,
  toSections,
  type HelpArticle,
  type HelpLocale,
  type HelpMeta,
  type HelpSource,
  type SearchableArticle,
} from '#shared/help'
import { renderArticle } from './render'

/** Raw files by `<locale>/<slug>.md` (or `<locale>:<slug>.md`, the storage key form). */
export type HelpFiles = Record<string, string>

export interface HelpLibrary {
  list(locale: string): HelpMeta[]
  get(locale: string, slug: string): HelpArticle | null
  index(locale: string): SearchableArticle[]
  locale(locale: string): HelpLocale
}

/** The locale to serve: the requested one when it has articles, English otherwise. */
function resolveLocale(requested: string): HelpLocale {
  const exact = HELP_LOCALES.find((l) => l.toLowerCase() === requested.toLowerCase())
  if (exact) return exact
  const base = requested.split('-')[0]?.toLowerCase()
  return HELP_LOCALES.find((l) => l.toLowerCase().split('-')[0] === base) ?? 'en'
}

export function sourcesFrom(files: HelpFiles): Record<HelpLocale, Map<string, HelpSource>> {
  const out = Object.fromEntries(HELP_LOCALES.map((l) => [l, new Map<string, HelpSource>()])) as Record<
    HelpLocale,
    Map<string, HelpSource>
  >
  for (const [key, raw] of Object.entries(files)) {
    const m = /^([^/:]+)[/:](.+)\.md$/.exec(key.replace(/\\/g, '/'))
    const locale = m && HELP_LOCALES.find((l) => l === m[1])
    if (!m || !locale) continue
    out[locale].set(m[2]!, parseArticle(m[2]!, raw))
  }
  return out
}

export function createHelpLibrary(files: HelpFiles): HelpLibrary {
  const sources = sourcesFrom(files)
  const rendered = new Map<string, HelpArticle>()
  const indexes = new Map<HelpLocale, SearchableArticle[]>()

  // A locale falls back to English per article, so a missing translation never hides a page.
  const sourceFor = (locale: HelpLocale, slug: string) => sources[locale].get(slug) ?? sources.en.get(slug)
  const slugs = (locale: HelpLocale) => new Set([...sources.en.keys(), ...sources[locale].keys()])

  return {
    locale: resolveLocale,
    list(requested) {
      const locale = resolveLocale(requested)
      return [...slugs(locale)].map((slug) => metaOf(sourceFor(locale, slug)!))
    },
    get(requested, slug) {
      const locale = resolveLocale(requested)
      const source = sourceFor(locale, slug)
      if (!source) return null
      const key = `${locale}:${slug}`
      const cached = rendered.get(key)
      if (cached) return cached
      const article: HelpArticle = {
        ...metaOf(source),
        html: renderArticle(source.body),
        headings: extractHeadings(source.body),
        relatedArticles: source.related.flatMap((r) => {
          const s = sourceFor(locale, r)
          return s ? [metaOf(s)] : []
        }),
      }
      rendered.set(key, article)
      return article
    },
    index(requested) {
      const locale = resolveLocale(requested)
      const cached = indexes.get(locale)
      if (cached) return cached
      const built = [...slugs(locale)].map((slug) => {
        const s = sourceFor(locale, slug)!
        return { ...metaOf(s), headings: extractHeadings(s.body), sections: toSections(s.body) }
      })
      indexes.set(locale, built)
      return built
    },
  }
}
