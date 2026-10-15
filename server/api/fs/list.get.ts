import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const DB_EXTENSIONS = /\.(db|db3|sqlite|sqlite3|s3db|sl3)$/i

export interface FsEntry {
  name: string
  type: 'dir' | 'file'
}

export interface FsListing {
  path: string
  parent: string | null
  entries: FsEntry[]
}

/**
 * Lists a directory of the machine DbLocal runs on, for the SQLite file picker. Names only: no
 * file content. Files are limited to database extensions unless `all=1`; dotfiles need `hidden=1`.
 */
export default defineEventHandler(async (event): Promise<FsListing> => {
  const query = getQuery(event)
  const raw = typeof query.path === 'string' && query.path.trim() ? query.path.trim() : homedir()
  const path = resolve(raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw)
  const all = query.all === '1'
  const hidden = query.hidden === '1'

  try {
    const info = await stat(path)
    if (!info.isDirectory()) {
      // A file path: list its folder, so pasting a file path still opens the right place.
      return listing(dirname(path), all, hidden)
    }
    return await listing(path, all, hidden)
  } catch (err) {
    const code = (err as { code?: string }).code
    throw createError({
      statusCode: code === 'ENOENT' ? 404 : code === 'EACCES' || code === 'EPERM' ? 403 : 400,
      statusMessage: 'Cannot read folder',
      data: { message: code ?? 'unknown' },
    })
  }
})

async function listing(path: string, all: boolean, hidden: boolean): Promise<FsListing> {
  const items = await readdir(path, { withFileTypes: true })
  const entries: FsEntry[] = []
  for (const item of items) {
    if (!hidden && item.name.startsWith('.')) continue
    if (item.isDirectory()) entries.push({ name: item.name, type: 'dir' })
    else if (item.isFile() && (all || DB_EXTENSIONS.test(item.name))) entries.push({ name: item.name, type: 'file' })
  }
  entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
  const parent = dirname(path)
  return { path, parent: parent === path ? null : parent, entries }
}
