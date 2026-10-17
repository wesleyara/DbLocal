import type { InjectionKey } from 'vue'

/** UI state the table nodes and edges read, kept out of the Vue Flow nodes so a hover never rebuilds them. */
export interface ErdUiState {
  /** Zoom is low: tables collapse to their name. */
  compact: boolean
  /** Selected table and its direct neighbours; everything else is dimmed. */
  selected: string | null
  neighbours: Set<string>
  /** Edge under the pointer and the `table.column` keys it links. */
  hoverEdge: string | null
  hoverColumns: Set<string>
  /** Table a new relation is being dragged from / over. */
  connecting: boolean
  /** Note whose text is being edited. */
  editingNote: string | null
}

export const ERD_UI: InjectionKey<ErdUiState> = Symbol('erd-ui')
