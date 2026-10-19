import { workspaceImportSchema } from '#shared/schemas/backup'
import type { WorkspaceImportResult } from '#shared/types/backup'
import { importWorkspace } from '../../backup/workspace-service'
import { parseBody, run } from '../../connections/http'
import { useStore } from '../../store/db'

/** Merges a workspace backup into this installation (same ids are replaced). */
export default defineEventHandler(async (event): Promise<WorkspaceImportResult> => {
  const body = parseBody(workspaceImportSchema, await readBody(event))
  return run(() => importWorkspace(useStore(), body.backup, body.password))
})
