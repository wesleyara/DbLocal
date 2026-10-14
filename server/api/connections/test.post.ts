import { connectionTestSchema, type ConnectionTestInput } from '#shared/schemas/connection'
import { buildDriverConfig } from '../../connections/config'
import { parseBody, run } from '../../connections/http'
import { loadDraft } from '../../connections/repository'
import { useStore } from '../../store/db'
import { testConnection } from '../../drivers'

/** Drops keys that were not sent, so they do not overwrite the saved values. */
function defined<T extends object>(value: T | undefined): Partial<T> {
  return Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== undefined)) as Partial<T>
}

export default defineEventHandler(async (event) => {
  const input = parseBody(connectionTestSchema, await readBody(event))
  return run(async () => {
    let draft: ConnectionTestInput = input
    if (input.connectionId) {
      const base = await loadDraft(useStore(), input.connectionId)
      draft = {
        ...base,
        ...defined(input),
        ssl: { ...base.ssl, ...defined(input.ssl) } as ConnectionTestInput['ssl'],
        ssh: input.ssh ? ({ ...base.ssh, ...defined(input.ssh) } as ConnectionTestInput['ssh']) : base.ssh,
      }
    }
    // Only the version and latency leave the server: the config, including secrets, never does.
    return testConnection(buildDriverConfig(draft))
  })
})
