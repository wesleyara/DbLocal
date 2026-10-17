/**
 * Side-effect module for md-editor-v3. By default the library injects highlight.js, prettier,
 * cropper, screenfull, mermaid, KaTeX and ECharts from unpkg; DbLocal is local-first and holds
 * database credentials, so nothing is fetched from a CDN: highlight.js and mermaid are bundled
 * here, the rest is turned off (`noPrettier`, `noUploadImg`, `noKatex`, `noEcharts` on the
 * editor, an inert screenfull). Imported only by `MarkdownEditor.vue`, which is lazy-loaded,
 * so mermaid stays out of the main bundle. Code colours come from `.md-editor .hljs-*` in main.css.
 */
import { config } from 'md-editor-v3'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import pgsql from 'highlight.js/lib/languages/pgsql'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import mermaid from 'mermaid'

const languages = { bash, javascript, json, pgsql, plaintext, python, sql, typescript, xml, yaml }
for (const [name, lang] of Object.entries(languages)) hljs.registerLanguage(name, lang)
hljs.registerAliases(['sh', 'shell', 'zsh'], { languageName: 'bash' })
hljs.registerAliases(['js'], { languageName: 'javascript' })
hljs.registerAliases(['ts'], { languageName: 'typescript' })
hljs.registerAliases(['postgres', 'postgresql'], { languageName: 'pgsql' })
hljs.registerAliases(['mysql', 'sqlite'], { languageName: 'sql' })
hljs.registerAliases(['html'], { languageName: 'xml' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' })

config({
  editorExtensions: {
    highlight: { instance: hljs },
    mermaid: { instance: mermaid },
    screenfull: { instance: { isEnabled: false, isFullscreen: false, request() {}, exit() {}, on() {} } },
  },
})
