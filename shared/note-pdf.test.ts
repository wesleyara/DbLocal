import { describe, expect, it } from 'vitest'
import { fillDiagrams, noteDocument, pdfFileName, renderNoteBody } from './note-pdf'

describe('renderNoteBody', () => {
  it('renders GFM: headings, tables, task lists', () => {
    const { html } = renderNoteBody('# Title\n\n| a | b |\n| - | :-: |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo')
    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<div class="table"><table>')
    expect(html).toContain('<th style="text-align:center">b</th>')
    expect(html).toMatch(/<input checked="" disabled="" type="checkbox"/)
  })

  it('highlights known languages and escapes the rest', () => {
    const hl = (code: string, lang: string) => (lang === 'sql' ? `<b>${code}</b>` : null)
    const { html } = renderNoteBody('```sql\nselect 1\n```\n\n```foo\n<x>\n```', hl)
    expect(html).toContain('<span class="code-lang">sql</span>')
    expect(html).toContain('<code class="hljs"><b>select 1</b></code>')
    expect(html).toContain('<code class="hljs">&lt;x&gt;</code>')
  })

  it('collects mermaid blocks and fills them in order', () => {
    const body = renderNoteBody('```mermaid\ngraph TD\n```\n\ntext\n\n```mermaid\nbad <\n```')
    expect(body.diagrams).toEqual(['graph TD', 'bad <'])
    const html = fillDiagrams(body, ['<svg>1</svg>', null])
    expect(html).toContain('<figure class="diagram"><svg>1</svg></figure>')
    expect(html).toContain('<pre class="diagram-source"><code>bad &lt;</code></pre>')
  })
})

describe('noteDocument', () => {
  it('escapes the header and joins the meta line', () => {
    const html = noteDocument({ lang: 'en', title: 'a<b', eyebrow: 'DbLocal · Notes', meta: ['x', '', 'y'], bodyHtml: '<p>hi</p>' })
    expect(html).toContain('<h1 class="title">a&lt;b</h1>')
    expect(html).toContain('<span>x</span><span class="dot">·</span><span>y</span>')
    expect(html).toContain('<title>a-b - DbLocal · Notes</title>')
    expect(html).toContain('@page')
  })

  it('makes a safe file name', () => {
    expect(pdfFileName('a/b: c', '  ', 'Notes')).toBe('a-b- c - Notes')
  })
})
