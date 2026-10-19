import { createReadStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getConnection } from '../../../connections/repository'
import { run } from '../../../connections/http'
import { QueryInputError } from '../../../query/errors'
import { connectionDriver } from '../../../schema/service'
import { useStore } from '../../../store/db'

/**
 * A binary copy of a SQLite file connection (the online backup API, so it is consistent while the
 * file is in use). Other connections dump to SQL instead (400 here).
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useStore()
  const { dir, name } = await run(async () => {
    const connection = await getConnection(db, id)
    const driver = await connectionDriver(db, id)
    if (!driver.backupTo) throw new QueryInputError(400, 'Only SQLite file connections have a file backup; use a SQL dump')
    const dir = await mkdtemp(join(tmpdir(), 'dblocal-backup-'))
    try {
      await driver.backupTo(join(dir, 'backup.sqlite'))
    } catch (err) {
      await rm(dir, { recursive: true, force: true })
      throw err
    }
    return { dir, name: connection.name }
  })
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  const filename = `${name.replace(/\.(sqlite3?|db)$/i, '')}-${stamp}.sqlite`.replace(/[^\w.-]+/g, '_')
  setHeader(event, 'Content-Type', 'application/vnd.sqlite3')
  setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  const stream = createReadStream(join(dir, 'backup.sqlite'))
  const cleanup = () => void rm(dir, { recursive: true, force: true })
  stream.on('close', cleanup)
  return sendStream(event, stream)
})
