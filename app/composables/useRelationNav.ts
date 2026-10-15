import { decodeRecord, encodeRecord, encodeScope, keyLabel, tablePath } from '#shared/nav-url'
import type { RecordKey } from '#shared/types/relations'
import { useWorkspaceStore, type TabMeta } from '~/stores/workspace'

interface Where {
  connectionId: string
  schema: string
}

/**
 * Moves around the data: open a record in the panel, follow a relation to a filtered table.
 * Every hop adds a breadcrumb segment; Ctrl / ⌘ opens it in a new workspace tab instead.
 */
export function useRelationNav(where: Where) {
  const route = useRoute()
  const router = useRouter()
  const workspace = useWorkspaceStore()

  const pageTable = () => String(route.params.table ?? '')

  /** Path of the current view with `r` replaced. */
  function withRecord(table: string, key: RecordKey | null): string {
    const query: Record<string, string | undefined> = {}
    for (const [name, value] of Object.entries(route.query)) {
      if (typeof value === 'string' && name !== 'r') query[name] = value
    }
    if (key) query.r = encodeRecord(table, key, pageTable())
    return tablePath(where.connectionId, where.schema, pageTable(), query)
  }

  function meta(table: string, record?: { key: RecordKey }): TabMeta {
    return {
      schema: where.schema,
      type: record ? 'record' : 'table',
      title: record ? `${table} ${keyLabel(record.key)}` : table,
      icon: record ? 'lucide:panel-right' : 'lucide:table-2',
    }
  }

  /** Opens a record in the panel (or in a new tab with its own trail). */
  async function openRecord(table: string, key: RecordKey, label: string | null, newTab = false): Promise<void> {
    const path = withRecord(table, key)
    const segment = { label: `${keyLabel(key)}${label ? ` ${label}` : ''}`, path, kind: 'record' as const }
    if (newTab) {
      const root = { label: pageTable(), path: tablePath(where.connectionId, where.schema, pageTable()), kind: 'table' as const }
      workspace.open(where.connectionId, path, meta(table, { key }), [root, segment])
      await navigateTo(path)
      return
    }
    workspace.expect(segment)
    await router.push(path)
  }

  /** Closes the record panel. */
  async function closeRecord(): Promise<void> {
    await router.push(withRecord(pageTable(), null))
  }

  /** Opens `target` filtered to the records related to one record of `table` through `relation`. */
  async function openRelated(
    table: string,
    relation: string,
    key: RecordKey,
    target: string,
    options: { count?: number | null; newTab?: boolean } = {},
  ): Promise<void> {
    const scope = encodeScope({ table, relation, key })
    const path = tablePath(where.connectionId, where.schema, target, { rel: scope })
    const segment = { label: options.count != null ? `${target} (${options.count})` : target, path, kind: 'relation' as const }
    if (options.newTab) {
      const origin = { label: `${table} ${keyLabel(key)}`, path: route.fullPath, kind: 'record' as const }
      workspace.open(where.connectionId, path, meta(target), [origin, segment])
      await navigateTo(path)
      return
    }
    workspace.expect(segment)
    await router.push(path)
  }

  /** The record currently open in the panel, if any. */
  const record = computed(() => decodeRecord(typeof route.query.r === 'string' ? route.query.r : null, pageTable()))

  return { openRecord, closeRecord, openRelated, record, withRecord }
}
