#!/usr/bin/env node
// Usage: node scripts/db.mjs up | down | seed
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const compose = ['compose', '-f', resolve(root, 'docker/compose.dev.yml')]
const seed = (f) => readFileSync(resolve(root, 'fixtures/seed', f), 'utf8')

function run(args, input) {
  const r = spawnSync('docker', args, { input, stdio: [input ? 'pipe' : 'inherit', 'inherit', 'inherit'] })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

function seedSqlite() {
  const file = resolve(root, 'fixtures/dev.sqlite')
  mkdirSync(dirname(file), { recursive: true })
  rmSync(file, { force: true })
  const db = new Database(file)
  db.exec(seed('sqlite.sql'))
  db.close()
  console.log('sqlite seeded:', file)
}

const cmd = process.argv[2]
if (cmd === 'up') {
  run([...compose, 'up', '-d', '--wait'])
} else if (cmd === 'down') {
  run([...compose, 'down', '-v'])
} else if (cmd === 'seed') {
  run(
    [...compose, 'exec', '-T', 'postgres', 'psql', '-v', 'ON_ERROR_STOP=1', '-q', '-U', 'dblocal', '-d', 'dblocal_dev'],
    seed('postgres.sql'),
  )
  run(
    [...compose, 'exec', '-T', 'mysql', 'mysql', '-udblocal', '-pdblocal', '--default-character-set=utf8mb4', 'dblocal_dev'],
    seed('mysql.sql'),
  )
  seedSqlite()
} else {
  console.error('usage: db.mjs up|down|seed')
  process.exit(1)
}
