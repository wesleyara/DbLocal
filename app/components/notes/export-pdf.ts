import { fillDiagrams, noteDocument, pdfFileName, renderNoteBody, type NoteDocument } from '#shared/note-pdf'

/**
 * Exports a note as PDF: renders the Markdown (highlighted code, mermaid diagrams as SVG) into a
 * print document (`#shared/note-pdf`) and opens the browser's print dialog on it from a hidden,
 * sandboxed iframe (no scripts run in it), where "Save as PDF" writes the file. Vector text, the
 * app's fonts, A4 with page numbers. highlight.js and mermaid are loaded on demand.
 */
export async function exportNotePdf(markdown: string, doc: Omit<NoteDocument, 'bodyHtml' | 'fontFaces'>): Promise<void> {
  const { default: hljs } = await import('./highlight')
  const body = renderNoteBody(markdown, (code, lang) =>
    hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : null,
  )
  const svgs = body.diagrams.length ? await drawDiagrams(body.diagrams) : []
  const html = noteDocument({ ...doc, bodyHtml: fillDiagrams(body, svgs), fontFaces: appFontFaces() })
  await printHtml(html, pdfFileName(doc.title, doc.eyebrow))
}

async function drawDiagrams(sources: string[]): Promise<(string | null)[]> {
  const { default: mermaid } = await import('mermaid')
  const out: (string | null)[] = []
  for (const [i, source] of sources.entries()) {
    const id = `note-pdf-diagram-${Date.now()}-${i}`
    try {
      // The init directive themes this diagram only; the editor's mermaid setup is left alone.
      const { svg } = await mermaid.render(id, `%%{init: {"theme": "neutral"}}%%\n${source}`)
      out.push(svg)
    } catch {
      out.push(null)
    } finally {
      document.getElementById(id)?.remove()
      document.getElementById(`d${id}`)?.remove()
    }
  }
  return out
}

/** The `@font-face` rules of Inter and JetBrains Mono as the app loaded them (`@nuxt/fonts`). */
function appFontFaces(): string {
  const rules: string[] = []
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList
    try {
      list = sheet.cssRules
    } catch {
      continue // cross-origin sheet
    }
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSFontFaceRule && /inter|jetbrains/i.test(rule.style.getPropertyValue('font-family'))) rules.push(rule.cssText)
    }
  }
  return rules.join('\n')
}

/** What the PDF prints above the note: the name, a small line above it and details below. */
export interface NoteExport {
  title: string
  eyebrow: string
  meta?: string[]
}

let pending: (() => void) | null = null

function printHtml(html: string, title: string): Promise<void> {
  pending?.()
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    const pageTitle = document.title
    let done = false
    const cleanup = () => {
      if (done) return
      done = true
      pending = null
      document.title = pageTitle
      frame.remove()
    }
    pending = cleanup
    frame.addEventListener('load', async () => {
      try {
        const win = frame.contentWindow
        const fdoc = frame.contentDocument
        if (!win || !fdoc) throw new Error('print frame unavailable')
        await Promise.race([Promise.all([fdoc.fonts.ready, imagesLoaded(fdoc)]), wait(5000)])
        // Browsers name the PDF after the top document's title.
        document.title = title
        win.addEventListener('afterprint', () => setTimeout(cleanup, 0), { once: true })
        win.focus()
        win.print()
        // Chrome blocks in print(); others return at once and fire afterprint later.
        setTimeout(cleanup, 60_000)
        resolve()
      } catch (e) {
        cleanup()
        reject(e)
      }
    }, { once: true })
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}

function imagesLoaded(doc: Document): Promise<unknown> {
  return Promise.all(
    Array.from(doc.images)
      .filter((img) => !img.complete)
      .map((img) => new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }) })),
  )
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
