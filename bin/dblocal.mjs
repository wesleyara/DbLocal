#!/usr/bin/env node
// dblocal: starts the bundled server (.output) and opens the browser, optionally straight into a connection.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const HELP = `dblocal ${pkg.version}
Local database browser for Postgres, MySQL and SQLite.

Usage:
  dblocal [options] [connection-string | sqlite-file]

Options:
  -p, --port <n>        Port to listen on (default 5555)
      --host <addr>     Address to bind (default 127.0.0.1)
      --data-dir <dir>  Where connections and the secret key live (default ~/.dblocal)
      --readonly        Make every connection read-only
      --no-open         Do not open the browser
  -v, --version         Print the version
  -h, --help            Print this help

Examples:
  dblocal
  dblocal postgres://user:pass@localhost:5432/mydb
  dblocal ./app.sqlite --readonly

Environment: DBLOCAL_PASSWORD (enables the login page), DBLOCAL_SECRET, DBLOCAL_DATA_DIR.`

function fail(message) {
  console.error(`dblocal: ${message}`)
  process.exit(1)
}

let parsed
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string', short: 'p' },
      host: { type: 'string' },
      'data-dir': { type: 'string' },
      readonly: { type: 'boolean' },
      'no-open': { type: 'boolean' },
      version: { type: 'boolean', short: 'v' },
      help: { type: 'boolean', short: 'h' },
    },
  })
} catch (err) {
  fail(`${err.message}\nRun "dblocal --help" for usage.`)
}
const { values, positionals } = parsed

if (values.help) {
  console.log(HELP)
  process.exit(0)
}
if (values.version) {
  console.log(pkg.version)
  process.exit(0)
}
if (positionals.length > 1) fail('expected at most one connection string')

const port = Number(values.port ?? process.env.DBLOCAL_PORT ?? 5555)
if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`invalid port: ${values.port}`)
const host = values.host ?? process.env.DBLOCAL_HOST ?? '127.0.0.1'

const entry = resolve(root, '.output/server/index.mjs')
if (!existsSync(entry)) fail('build output not found. Run "pnpm build" first.')

process.env.NITRO_HOST = host
process.env.NITRO_PORT = String(port)
process.env.DBLOCAL_HOST = host
process.env.DBLOCAL_PORT = String(port)
if (values['data-dir']) process.env.DBLOCAL_DATA_DIR = resolve(values['data-dir'])
if (values.readonly) process.env.DBLOCAL_READONLY = '1'

if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.DBLOCAL_PASSWORD) {
  console.warn(`dblocal: listening on ${host} without DBLOCAL_PASSWORD. Anyone who can reach this port can use your databases.`)
}

const origin = `http://${host.includes(':') ? `[${host}]` : host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '""', url]]
        : ['xdg-open', [url]]
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true })
  child.on('error', () => console.log(`Open ${url} in your browser.`))
  child.unref()
}

async function waitUntilUp() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  fail(`the server did not start on ${origin}`)
}

async function connectionUrl(target) {
  const headers = { 'content-type': 'application/json' }
  const password = process.env.DBLOCAL_PASSWORD
  if (password) {
    const login = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify({ password }) })
    const cookie = login.headers.get('set-cookie')?.split(';')[0]
    if (!login.ok || !cookie) fail('could not sign in with DBLOCAL_PASSWORD')
    headers.cookie = cookie
  }
  const res = await fetch(`${origin}/api/connections/open`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ connectionString: target, readonly: values.readonly || undefined }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    fail(body.statusMessage ?? `could not open the connection (HTTP ${res.status})`)
  }
  const connection = await res.json()
  return `${origin}/c/${connection.id}`
}

console.log(`dblocal ${pkg.version}`)
await import(pathToFileURL(entry).href)

if (positionals[0] || !values['no-open']) {
  await waitUntilUp()
  let url = origin
  if (positionals[0]) url = await connectionUrl(positionals[0])
  if (!values['no-open']) openBrowser(url)
  else console.log(url)
}
