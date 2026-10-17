import type { InjectionKey } from 'vue'
import type { LabelBox } from '#shared/erd'

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
  /** Where each edge would put its cardinality chip; the canvas spreads them (`spreadLabels`). */
  labelBoxes: Map<string, LabelBox>
  /** Vertical shift of each chip, so chips of edges sharing a channel do not overlap. */
  labelOffsets: Map<string, number>
  /** Lines moved by hand: edge id -> horizontal shift of the vertical leg (saved with the layout). */
  wires: Map<string, number>
}

export const ERD_UI: InjectionKey<ErdUiState> = Symbol('erd-ui')
