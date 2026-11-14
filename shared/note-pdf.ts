import { Marked, type Tokens } from 'marked'

/**
 * Pure pieces of the note PDF export (`app/components/notes/export-pdf.ts`): the Markdown body as
 * HTML and the printable document around it. The browser prints that document from a sandboxed
 * iframe ("Save as PDF"), so the text stays selectable and the layout is driven by print CSS.
 */

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Highlights code for a language, or `null` when the language is unknown (the code is escaped then). */
export type Highlighter = (code: string, lang: string) => string | null

export interface NoteBody {
  /** HTML with `<!--diagram:N-->` where each mermaid block goes. */
  html: string
  /** Source of each mermaid block, in order. */
  diagrams: string[]
}

const diagramMark = (i: number) => `<!--diagram:${i}-->`

/** Markdown (GFM: tables, task lists, strikethrough) to HTML; mermaid blocks become placeholders. */
export function renderNoteBody(markdown: string, highlight?: Highlighter): NoteBody {
  const diagrams: string[] = []
  const marked = new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }: Tokens.Code) {
        const language = (lang ?? '').trim().split(/\s/)[0]?.toLowerCase() ?? ''
        if (language === 'mermaid') {
          diagrams.push(text)
          return `<figure class="diagram">${diagramMark(diagrams.length - 1)}</figure>\n`
        }
        const code = (language && highlight?.(text, language)) || escapeHtml(text)
        const label = language ? `<span class="code-lang">${escapeHtml(language)}</span>` : ''
        return `<div class="code">${label}<pre><code class="hljs">${code}</code></pre></div>\n`
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell, tag: 'th' | 'td') =>
          `<${tag}${c.align ? ` style="text-align:${c.align}"` : ''}>${this.parser.parseInline(c.tokens)}</${tag}>`
        const head = `<tr>${token.header.map((c) => cell(c, 'th')).join('')}</tr>`
        const body = token.rows.map((r) => `<tr>${r.map((c) => cell(c, 'td')).join('')}</tr>`).join('')
        return `<div class="table"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>\n`
      },
    },
  })
  return { html: marked.parse(markdown, { async: false }), diagrams }
}

/** Puts the drawn diagrams (SVG markup, or `null` when drawing failed) in place of their marks. */
export function fillDiagrams(body: NoteBody, svgs: (string | null)[]): string {
  return body.html.replace(/<!--diagram:(\d+)-->/g, (_, i: string) => {
    const svg = svgs[Number(i)]
    return svg ?? `<pre class="diagram-source"><code>${escapeHtml(body.diagrams[Number(i)] ?? '')}</code></pre>`
  })
}

export interface NoteDocument {
  /** Document language (`en`, `pt-BR`). */
  lang: string
  /** Big heading: the connection or table name. */
  title: string
  /** Small line above the title (`DbLocal · Connection notes`). */
  eyebrow: string
  /** Pieces of the line under the title (schema, edit date, export date). */
  meta: string[]
  /** Rendered note (after `fillDiagrams`). */
  bodyHtml: string
  /** `@font-face` rules copied from the app, so Inter and JetBrains Mono print too. */
  fontFaces?: string
}

/** File name for the PDF (the print dialog takes it from the document title). */
export function pdfFileName(...parts: string[]): string {
  return parts
    .map((p) => p.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(' - ')
}

/** The whole printable HTML document. Colours are the print palette, independent of the app theme. */
export function noteDocument(doc: NoteDocument): string {
  const meta = doc.meta.filter(Boolean).map((m) => `<span>${escapeHtml(m)}</span>`).join('<span class="dot">·</span>')
  return `<!doctype html>
<html lang="${escapeHtml(doc.lang)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(pdfFileName(doc.title, doc.eyebrow))}</title>
<style>${doc.fontFaces ?? ''}
${PRINT_CSS}</style>
</head>
<body>
<header class="cover">
  <p class="eyebrow">${escapeHtml(doc.eyebrow)}</p>
  <h1 class="title">${escapeHtml(doc.title)}</h1>
  ${meta ? `<p class="meta">${meta}</p>` : ''}
</header>
<main class="note">
${doc.bodyHtml}
</main>
</body>
</html>`
}

const PRINT_CSS = `
:root {
  --ink: #18181b;
  --ink-muted: #52525b;
  --ink-subtle: #71717a;
  --rule: #e4e4e7;
  --paper-tint: #f7f7f8;
  --accent: #3b5bdb;
  --accent-soft: #edf1fd;
  --code-keyword: #7c3aed;
  --code-string: #15803d;
  --code-number: #c2410c;
  --code-comment: #8a8a94;
  --code-title: #1d4ed8;
  --code-type: #b45309;
  --code-meta: #be185d;
  --sans: 'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
@page {
  size: A4;
  margin: 20mm 18mm 22mm;
  @bottom-right { content: counter(page) ' / ' counter(pages); font: 8pt var(--sans); color: #71717a; }
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  color: var(--ink);
  background: #fff;
  font-family: var(--sans);
  font-size: 10.5pt;
  line-height: 1.6;
  font-feature-settings: 'cv11', 'ss01';
  -webkit-font-smoothing: antialiased;
  orphans: 3;
  widows: 3;
}

.cover { margin-bottom: 9mm; padding-bottom: 5mm; border-bottom: 1.5pt solid var(--ink); }
.eyebrow {
  margin: 0 0 2.5mm;
  color: var(--accent);
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.title { margin: 0; font-size: 24pt; line-height: 1.15; font-weight: 700; letter-spacing: -0.02em; overflow-wrap: anywhere; }
.meta { margin: 3mm 0 0; color: var(--ink-subtle); font-size: 8.5pt; }
.meta .dot { margin: 0 0.6em; color: var(--ink-subtle); }

.note > :first-child { margin-top: 0; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; letter-spacing: -0.01em; break-after: avoid; page-break-after: avoid; }
h1 { margin: 9mm 0 3mm; font-size: 17pt; font-weight: 700; }
h2 { margin: 8mm 0 3mm; padding-bottom: 1.5mm; font-size: 13.5pt; font-weight: 650; border-bottom: 0.75pt solid var(--rule); }
h3 { margin: 6mm 0 2mm; font-size: 11.5pt; font-weight: 650; }
h4, h5, h6 { margin: 5mm 0 1.5mm; font-size: 10.5pt; font-weight: 650; }
h5, h6 { color: var(--ink-muted); }
p { margin: 0 0 3mm; }
a { color: var(--accent); text-decoration: none; border-bottom: 0.5pt solid currentColor; }
strong { font-weight: 650; }
mark { background: #fff3bf; color: inherit; padding: 0 0.15em; }
hr { margin: 7mm 0; border: 0; border-top: 0.75pt solid var(--rule); }
img { max-width: 100%; height: auto; border-radius: 1.5mm; break-inside: avoid; }

ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin: 0.8mm 0; }
li > p { margin: 0; }
li::marker { color: var(--ink-subtle); }
li:has(> input[type='checkbox']) { list-style: none; margin-left: -5mm; }
input[type='checkbox'] {
  appearance: none;
  display: inline-block;
  width: 3.2mm;
  height: 3.2mm;
  margin: 0 2mm 0 0;
  vertical-align: -0.4mm;
  border: 0.75pt solid var(--ink-subtle);
  border-radius: 0.8mm;
}
input[type='checkbox']:checked {
  background: var(--accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M4 8.5l2.5 2.5L12 5.5' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 100% no-repeat;
  border-color: var(--accent);
}

blockquote {
  margin: 4mm 0;
  padding: 2.5mm 4mm;
  color: var(--ink-muted);
  background: var(--accent-soft);
  border-left: 1mm solid var(--accent);
  border-radius: 0 1.5mm 1.5mm 0;
  break-inside: avoid;
}
blockquote > :last-child { margin-bottom: 0; }

code { font-family: var(--mono); font-size: 0.86em; }
:not(pre) > code {
  padding: 0.25mm 1.2mm;
  background: var(--paper-tint);
  border: 0.5pt solid var(--rule);
  border-radius: 1mm;
}
.code { position: relative; margin: 4mm 0; break-inside: avoid; }
.code pre, .diagram-source {
  margin: 0;
  padding: 3.5mm 4mm;
  background: var(--paper-tint);
  border: 0.5pt solid var(--rule);
  border-radius: 1.5mm;
  font-size: 8.5pt;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.code-lang {
  position: absolute;
  top: 1.5mm;
  right: 2.5mm;
  color: var(--ink-subtle);
  font-family: var(--mono);
  font-size: 6.5pt;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-literal { color: var(--code-keyword); }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute { color: var(--code-string); }
.hljs-number, .hljs-symbol, .hljs-bullet { color: var(--code-number); }
.hljs-comment, .hljs-quote { color: var(--code-comment); font-style: italic; }
.hljs-title, .hljs-section, .hljs-function { color: var(--code-title); }
.hljs-type, .hljs-class, .hljs-variable, .hljs-template-variable, .hljs-attr, .hljs-property { color: var(--code-type); }
.hljs-meta, .hljs-tag, .hljs-name, .hljs-deletion { color: var(--code-meta); }

.table { margin: 4mm 0; break-inside: avoid; }
table { width: 100%; border-collapse: collapse; font-size: 9pt; }
th, td { padding: 1.8mm 2.5mm; text-align: left; vertical-align: top; border-bottom: 0.5pt solid var(--rule); }
th { font-weight: 650; border-bottom: 1pt solid var(--ink); }
tbody tr:nth-child(even) td { background: var(--paper-tint); }
tr { break-inside: avoid; }

.diagram { margin: 5mm 0; text-align: center; break-inside: avoid; }
.diagram svg { max-width: 100%; height: auto; }
`
