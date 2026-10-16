import type { NamespaceList } from '#shared/types/connection'

/**
 * The connect call of a connection (lists its namespaces). Every caller uses the same key and
 * options, so the sidebar, the connection page and the status bar share one request, its
 * error and its `refresh`.
 */
export function useNamespaces(connectionId: string) {
  return useFetch<NamespaceList>(`/api/connections/${connectionId}/connect`, {
    method: 'POST',
    key: `namespaces-${connectionId}`,
  })
}
