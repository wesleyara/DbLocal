import { defineStore } from 'pinia'
import type { VirtualRelationInput } from '#shared/schemas/virtual-relation'
import type { RelationGraph, SchemaResponse, SchemaSnapshot, VirtualRelationDef } from '#shared/types/db'

/**
 * The schema the workspace is browsing: snapshot, relation graph and the connection's virtual
 * relations. Shared by the sidebar tree, the table view and the virtual relations dialog.
 */
export const useSchemaStore = defineStore('schema', () => {
  // Forwards the session cookie during SSR (a bare $fetch would reach the API unauthenticated on a reload).
  const requestFetch = useRequestFetch()
  const connectionId = ref<string | null>(null)
  const schema = ref<string | null>(null)
  const snapshot = shallowRef<SchemaSnapshot | null>(null)
  const graph = shallowRef<RelationGraph | null>(null)
  const virtual = ref<VirtualRelationDef[]>([])
  const loading = ref(false)
  const error = ref<unknown>(null)

  const tables = computed(() => snapshot.value?.tables ?? [])
  const dialect = computed(() => snapshot.value?.dialect ?? null)

  function schemaQuery(name: string | null): string {
    return name ? `?schema=${encodeURIComponent(name)}` : ''
  }

  /** Loads the schema for a connection. `refresh` drops the server cache and introspects again. */
  async function load(id: string, name: string | null = schema.value, refresh = false): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const res = refresh
        ? await requestFetch<SchemaResponse>(`/api/c/${id}/schema/refresh${schemaQuery(name)}`, { method: 'POST' })
        : await requestFetch<SchemaResponse>(`/api/c/${id}/schema${schemaQuery(name)}`)
      connectionId.value = id
      schema.value = res.snapshot.schema
      snapshot.value = res.snapshot
      graph.value = res.graph
      virtual.value = await requestFetch<VirtualRelationDef[]>(
        `/api/c/${id}/virtual-relations${schemaQuery(res.snapshot.schema)}`,
      )
    } catch (err) {
      // Only the response body: a FetchError instance cannot be serialised into the SSR payload.
      error.value = { data: (err as { data?: unknown }).data ?? null }
      // Another connection's or schema's tables must not stay on screen under this one's error.
      if (connectionId.value !== id || (name !== null && schema.value !== name)) {
        connectionId.value = id
        schema.value = name
        snapshot.value = null
        graph.value = null
        virtual.value = []
      }
      throw err
    } finally {
      loading.value = false
    }
  }

  /** Loads in flight, by connection + schema, so the tree and the page share one request. */
  const inflight = new Map<string, Promise<void>>()

  /** Loads only when the connection or schema differs from what is already in memory. */
  async function ensure(id: string, name: string | null): Promise<void> {
    if (connectionId.value === id && (name === null || schema.value === name) && snapshot.value) return
    const key = `${id}|${name ?? ''}`
    let pending = inflight.get(key)
    if (!pending) {
      pending = load(id, name).finally(() => inflight.delete(key))
      inflight.set(key, pending)
    }
    await pending
  }

  /** Reloads the graph after a change to virtual relations or display columns. */
  async function reload(): Promise<void> {
    if (connectionId.value) await load(connectionId.value, schema.value)
  }

  async function addVirtual(input: VirtualRelationInput): Promise<void> {
    await requestFetch(`/api/c/${connectionId.value}/virtual-relations`, { method: 'POST', body: input })
    await reload()
  }

  async function updateVirtual(relationId: string, input: VirtualRelationInput): Promise<void> {
    await requestFetch(`/api/c/${connectionId.value}/virtual-relations/${relationId}`, { method: 'PATCH', body: input })
    await reload()
  }

  async function removeVirtual(relationId: string): Promise<void> {
    await requestFetch(`/api/c/${connectionId.value}/virtual-relations/${relationId}`, { method: 'DELETE' })
    await reload()
  }

  /** `column: null` clears the override and goes back to the inferred display column. */
  async function setDisplayColumn(table: string, column: string | null): Promise<void> {
    await requestFetch(`/api/c/${connectionId.value}/display-column`, {
      method: 'PUT',
      body: { schema: schema.value, table, column },
    })
    await reload()
  }

  return {
    connectionId,
    schema,
    snapshot,
    graph,
    virtual,
    loading,
    error,
    tables,
    dialect,
    load,
    ensure,
    reload,
    addVirtual,
    updateVirtual,
    removeVirtual,
    setDisplayColumn,
  }
})
