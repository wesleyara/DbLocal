/**
 * Pure helpers of the help centre: article frontmatter, heading ids and the search over articles.
 * The articles are Markdown in `content/help/<locale>/<slug>.md`; rendering is server-only
 * (`server/help/render.ts`), everything the UI and the tests need to reason about lives here.
 */

export interface HelpMeta {
  slug: string
  title: string
  description: string
  category: string
  order: number
  /** Slugs of related articles. */
  related: string[]
}

export interface HelpHeading {
  id: string
  text: string
  level: number
}

export interface HelpSource extends HelpMeta {
  body: string
}

export interface HelpArticle extends HelpMeta {
  html: string
  headings: HelpHeading[]
  /** Metadata of the related articles that exist in the same locale. */
  relatedArticles: HelpMeta[]
}

export interface HelpHit {
  slug: string
  title: string
  description: string
  category: string
  /** Heading the match was found under, when it was not in the title or description. */
  heading: { id: string; text: string } | null
  /** Plain text around the first body match (or the description). */
  snippet: string
  score: number
}

export const HELP_LOCALES = ['en', 'pt-BR'] as const
export type HelpLocale = (typeof HELP_LOCALES)[number]

export const REQUIRED_FRONTMATTER = ['title', 'description', 'category', 'order', 'related'] as const

/** Parses a flat `key: value` frontmatter block (`related: [a, b]` is a list). Throws on a missing field. */
export function parseArticle(slug: string, raw: string): HelpSource {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) throw new Error(`help/${slug}: missing frontmatter`)
  const fields: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const m = /^([a-zA-Z_]+):\s*(.*)$/.exec(line)
    if (m) fields[m[1]!] = m[2]!.trim()
  }
  for (const key of REQUIRED_FRONTMATTER) {
    if (!(key in fields)) throw new Error(`help/${slug}: frontmatter field "${key}" is missing`)
  }
  const order = Number(fields.order)
  if (!Number.isFinite(order)) throw new Error(`help/${slug}: "order" must be a number`)
  const related = (/^\[(.*)\]$/.exec(fields.related!)?.[1] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const unquote = (v: string) => v.replace(/^(["'])(.*)\1$/, '$2')
  return {
    slug,
    title: unquote(fields.title!),
    description: unquote(fields.description!),
    category: unquote(fields.category!),
    order,
    related,
    body: raw.slice(match[0].length),
  }
}

/** Inline Markdown removed, for heading ids, search and snippets. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|\*|_)(.+?)\1/g, '$2')
    .trim()
}

export function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'section'
  )
}

/** Unique heading ids within one article (`setup`, `setup-1`...). */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text) => {
    const base = slugify(text)
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base}-${n}`
  }
}

const EXPLICIT_ID = /\s*\{#([a-z0-9][a-z0-9-]*)\}\s*$/

/**
 * A heading may carry a stable id (`## SSH tunnel {#ssh-tunnel}`), the same in every locale, so
 * links and hints do not depend on the translated title. Without one the id comes from the text.
 */
export function parseHeading(raw: string, slug: (text: string) => string): { id: string; text: string } {
  const explicit = EXPLICIT_ID.exec(raw)
  const text = plainText(explicit ? raw.slice(0, explicit.index) : raw)
  return { id: explicit ? explicit[1]! : slug(text), text }
}

/** `##` and `###` headings of a Markdown body, with the same ids the renderer gives them. */
export function extractHeadings(body: string): HelpHeading[] {
  const slug = createSlugger()
  const out: HelpHeading[] = []
  let fenced = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) fenced = !fenced
    if (fenced) continue
    const m = /^(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const { id, text } = parseHeading(m[2]!, slug)
    // `#` is the article title: it takes an id (so the sluggers stay aligned) but is not listed.
    if (m[1]!.length > 1) out.push({ id, text, level: m[1]!.length })
  }
  return out
}

export function metaOf(source: HelpSource): HelpMeta {
  const { slug, title, description, category, order, related } = source
  return { slug, title, description, category, order, related }
}

/** Categories in order of their first article, each with its articles by `order`. */
export function groupByCategory(metas: HelpMeta[]): { category: string; articles: HelpMeta[] }[] {
  const sorted = [...metas].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  const groups = new Map<string, HelpMeta[]>()
  for (const m of sorted) groups.set(m.category, [...(groups.get(m.category) ?? []), m])
  return [...groups].map(([category, articles]) => ({ category, articles }))
}

export interface SearchableArticle extends HelpMeta {
  headings: HelpHeading[]
  /** Plain text of the body, one string per section: `{ heading: id | null, text }`. */
  sections: { heading: { id: string; text: string } | null; text: string }[]
}

/** Splits a Markdown body into sections by heading, as plain text, for the search index. */
export function toSections(body: string): SearchableArticle['sections'] {
  const slug = createSlugger()
  const sections: SearchableArticle['sections'] = [{ heading: null, text: '' }]
  let fenced = false
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      continue
    }
    const m = !fenced ? /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line) : null
    if (m) {
      const { id, text } = parseHeading(m[2]!, slug)
      if (m[1]!.length > 1) sections.push({ heading: { id, text }, text: '' })
      continue
    }
    const last = sections[sections.length - 1]!
    last.text += `${plainText(line.replace(/^\s*([-*>]|\d+\.)\s+/, ''))} `
  }
  return sections.map((s) => ({ ...s, text: s.text.replace(/\s+/g, ' ').trim() }))
}

const SNIPPET = 140

/** Words of a query, lower case, longer than one character unless it is the only one. */
export function queryTerms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return words.length > 1 ? words.filter((w) => w.length > 1) : words
}

/**
 * Full-text search over title, headings and body. Every term must appear somewhere in the article;
 * title matches weigh most, then headings, then the description, then the body.
 */
export function searchArticles(articles: SearchableArticle[], query: string): HelpHit[] {
  const terms = queryTerms(query)
  if (terms.length === 0) return []
  const hits: HelpHit[] = []
  for (const article of articles) {
    const title = article.title.toLowerCase()
    const description = article.description.toLowerCase()
    let score = 0
    let firstBody: { section: SearchableArticle['sections'][number]; at: number } | null = null
    let firstHeading: HelpHeading | null = null
    let allFound = true
    for (const term of terms) {
      let found = false
      if (title.includes(term)) {
        score += title.startsWith(term) ? 120 : 100
        found = true
      }
      const heading = article.headings.find((h) => h.text.toLowerCase().includes(term))
      if (heading) {
        score += 50
        found = true
        firstHeading ??= heading
      }
      if (description.includes(term)) {
        score += 20
        found = true
      }
      for (const section of article.sections) {
        const at = section.text.toLowerCase().indexOf(term)
        if (at === -1) continue
        score += 5
        found = true
        firstBody ??= { section, at }
        break
      }
      if (!found) {
        allFound = false
        break
      }
    }
    if (!allFound) continue
    const base = { slug: article.slug, title: article.title, description: article.description, category: article.category, score }
    if (firstBody) {
      const { section, at } = firstBody
      const start = Math.max(0, at - 40)
      const text = section.text.slice(start, start + SNIPPET)
      hits.push({
        ...base,
        heading: section.heading,
        snippet: `${start > 0 ? '…' : ''}${text}${start + SNIPPET < section.text.length ? '…' : ''}`,
      })
    } else {
      hits.push({ ...base, heading: firstHeading ? { id: firstHeading.id, text: firstHeading.text } : null, snippet: article.description })
    }
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
}

/** Splits `text` around the (case-insensitive) terms, for `<mark>` highlighting in the UI. */
export function highlightParts(text: string, terms: string[]): { text: string; match: boolean }[] {
  const useful = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (useful.length === 0) return [{ text, match: false }]
  const re = new RegExp(`(${useful.join('|')})`, 'gi')
  return text
    .split(re)
    .map((part, i) => ({ text: part, match: i % 2 === 1 }))
    .filter((part) => part.text !== '')
}
