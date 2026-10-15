import { Marked, type Tokens } from 'marked'
import { createSlugger, parseHeading } from '#shared/help'

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const CALLOUTS = {
  NOTE: { kind: 'info', icon: 'lucide:info' },
  TIP: { kind: 'info', icon: 'lucide:lightbulb' },
  WARNING: { kind: 'warning', icon: 'lucide:triangle-alert' },
  DANGER: { kind: 'danger', icon: 'lucide:octagon-alert' },
} as const

/**
 * Renders an article body to HTML. The sources are files of this repository, so raw HTML (`<kbd>`)
 * is passed through. Custom pieces, styled by `.help-prose` in `main.css` and wired by
 * `components/help/ArticleBody.vue`:
 * - headings get an id (same rule as `extractHeadings`) and a `#` anchor link;
 * - code blocks get a copy button (`data-help-copy`);
 * - `> [!NOTE]`, `[!TIP]`, `[!WARNING]` and `[!DANGER]` blockquotes become callouts;
 * - images are zoomable (`data-help-zoom`); `{theme}` in the URL is replaced per theme on the client.
 */
export function renderArticle(body: string): string {
  const slug = createSlugger()
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const { id } = parseHeading(tokens.map((t) => t.raw).join(''), slug)
        // The `{#id}` suffix is part of the last text token; it is not shown.
        const shown = tokens.map((t, i) =>
          i === tokens.length - 1 && 'text' in t ? { ...t, text: String(t.text).replace(/\s*\{#[a-z0-9-]+\}\s*$/, ''), raw: t.raw.replace(/\s*\{#[a-z0-9-]+\}\s*$/, '') } : t,
        ) as Tokens.Generic[]
        const inline = this.parser.parseInline(shown)
        if (depth === 1) return `<h1 id="${id}">${inline}</h1>\n`
        return `<h${depth} id="${id}">${inline}<a class="help-anchor" href="#${id}" aria-label="#">#</a></h${depth}>\n`
      },
      code({ text, lang }: Tokens.Code) {
        const language = (lang ?? '').split(/\s/)[0] ?? ''
        const label = language ? `<span class="help-code-lang">${escapeHtml(language)}</span>` : ''
        return `<div class="help-code">${label}<button type="button" class="help-copy" data-help-copy aria-label="Copy"></button><pre><code${language ? ` class="language-${escapeHtml(language)}"` : ''}>${escapeHtml(text)}</code></pre></div>\n`
      },
      blockquote({ tokens }: Tokens.Blockquote) {
        const first = tokens[0]
        const marker = first?.type === 'paragraph' ? /^\[!(NOTE|TIP|WARNING|DANGER)\]\s*/i.exec(first.text) : null
        if (!marker || first?.type !== 'paragraph') return `<blockquote>${this.parser.parse(tokens)}</blockquote>\n`
        const callout = CALLOUTS[marker[1]!.toUpperCase() as keyof typeof CALLOUTS]
        // Drop the `[!NOTE]` marker from the first inline token; the rest of the paragraph stays.
        const inline = (first.tokens ?? []).map((t, i) =>
          i === 0 && 'text' in t ? { ...t, text: t.text.slice(marker[0].length), raw: t.raw.slice(marker[0].length) } : t,
        ) as Tokens.Generic[]
        const lead = inline.some((t) => 'text' in t && String(t.text).trim() !== '') || inline.length > 1
          ? `<p>${this.parser.parseInline(inline)}</p>`
          : ''
        return `<aside class="help-callout help-callout-${callout.kind}" role="note" data-icon="${callout.icon}">${lead}${this.parser.parse(tokens.slice(1))}</aside>\n`
      },
      image({ href, title, text }: Tokens.Image) {
        const themed = href.includes('{theme}')
        const src = escapeHtml(href.replace('{theme}', 'dark'))
        const attrs = themed ? ` data-help-src="${escapeHtml(href)}"` : ''
        const caption = title ? ` title="${escapeHtml(title)}"` : ''
        return `<img src="${src}"${attrs} alt="${escapeHtml(text)}"${caption} loading="lazy" data-help-zoom>`
      },
      table(token: Tokens.Table) {
        const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('')
        const rows = token.rows
          .map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`)
          .join('')
        return `<div class="help-table"><table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>\n`
      },
    },
  })
  return marked.parse(body, { async: false })
}
