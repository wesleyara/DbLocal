import { workspaceExportSchema } from '#shared/schemas/backup'
import { exportWorkspace } from '../../backup/workspace-service'
import { parseBody, run } from '../../connections/http'
import { useStore } from '../../store/db'

/** DbLocal's own data as a JSON download; connection secrets encrypted with `password`, or left out. */
export default defineEventHandler(async (event) => {
  const body = parseBody(workspaceExportSchema, await readBody(event))
  const backup = await run(() => exportWorkspace(useStore(), body))
  const stamp = backup.createdAt.slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="dblocal-workspace-${stamp}.json"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return JSON.stringify(backup, null, 2)
})
