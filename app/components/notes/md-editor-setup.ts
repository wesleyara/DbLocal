/**
 * Side-effect module for md-editor-v3. By default the library injects highlight.js, prettier,
 * cropper, screenfull, mermaid, KaTeX and ECharts from unpkg; DbLocal is local-first and holds
 * database credentials, so nothing is fetched from a CDN: highlight.js and mermaid are bundled
 * here, the rest is turned off (`noPrettier`, `noUploadImg`, `noKatex`, `noEcharts` on the
 * editor, an inert screenfull). Imported only by `MarkdownEditor.vue`, which is lazy-loaded,
 * so mermaid stays out of the main bundle. The languages are registered in `highlight.ts`. Code colours come from `.md-editor .hljs-*` in main.css.
 */
import { config } from 'md-editor-v3'
import mermaid from 'mermaid'
import hljs from './highlight'

config({
  editorExtensions: {
    highlight: { instance: hljs },
    mermaid: { instance: mermaid },
    screenfull: { instance: { isEnabled: false, isFullscreen: false, request() {}, exit() {}, on() {} } },
  },
})
