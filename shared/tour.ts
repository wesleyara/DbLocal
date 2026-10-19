import { encodeRecord, encodeScope, tablePath } from './nav-url'

/**
 * The "Essentials" tour: one pass over the main flow, run on the demo database. Steps point at an
 * element by `data-tour="<target>"`; texts are `tour.steps.<id>.title|body` in the locale files.
 * Pure data and path building, so the step list is testable without a browser.
 */
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TourStep {
  id: string
  /** `data-tour` value of the element to spotlight; null centres the popover. */
  target: string | null
  placement: TourPlacement
}

export interface TourContext {
  connectionId: string
  schema: string
}

export const TOUR_ID = 'essentials'

export const TOUR_STEPS: TourStep[] = [
  { id: 'tables', target: 'sidebar', placement: 'right' },
  { id: 'grid', target: 'grid', placement: 'top' },
  { id: 'children', target: 'relation-count', placement: 'bottom' },
  { id: 'parents', target: 'fk-chip', placement: 'bottom' },
  { id: 'related', target: 'scope', placement: 'bottom' },
  { id: 'record', target: 'record-panel', placement: 'left' },
  { id: 'trail', target: 'breadcrumb', placement: 'bottom' },
  { id: 'edit', target: 'grid', placement: 'top' },
  { id: 'safety', target: 'grid', placement: 'top' },
  { id: 'structure', target: 'structure', placement: 'bottom' },
  { id: 'routines', target: 'more', placement: 'bottom' },
  { id: 'backup', target: 'more', placement: 'bottom' },
  { id: 'sql', target: 'new-query', placement: 'bottom' },
  { id: 'palette', target: 'palette', placement: 'bottom' },
]

/**
 * Where a step happens. Navigating here first means a step never depends on what the user did
 * before it: Next always lands on a page that has the element.
 */
export function tourPath(stepId: string, ctx: TourContext): string {
  const { connectionId: c, schema: s } = ctx
  switch (stepId) {
    case 'tables':
      return `/c/${c}/${encodeURIComponent(s)}`
    case 'grid':
    case 'children':
    case 'structure':
      return tablePath(c, s, 'users')
    case 'parents':
    case 'edit':
    case 'safety':
      return tablePath(c, s, 'orders')
    case 'related':
      return tablePath(c, s, 'orders', { rel: encodeScope({ table: 'users', relation: 'users.orders', key: { id: 1 } }) })
    case 'record':
    case 'trail':
      return tablePath(c, s, 'orders', { r: encodeRecord('orders', { id: 1 }, 'orders') })
    case 'sql':
    case 'palette':
      return `/c/${c}/${encodeURIComponent(s)}`
    default:
      return `/c/${c}/${encodeURIComponent(s)}`
  }
}

export type TourStatus = 'new' | 'running' | 'skipped' | 'done'

export interface TourState {
  status: TourStatus
  step: number
  connectionId: string | null
  schema: string
}

export const initialTourState = (): TourState => ({ status: 'new', step: 0, connectionId: null, schema: 'main' })

/** Parses what was saved; anything unexpected falls back to a fresh tour. */
export function readTourState(raw: string | null): TourState {
  if (!raw) return initialTourState()
  try {
    const v = JSON.parse(raw) as Partial<TourState>
    const status: TourStatus = v.status === 'running' || v.status === 'skipped' || v.status === 'done' ? v.status : 'new'
    const step = Number.isInteger(v.step) ? Math.min(Math.max(v.step as number, 0), TOUR_STEPS.length - 1) : 0
    const connectionId = typeof v.connectionId === 'string' ? v.connectionId : null
    // A running tour without a connection cannot resume.
    return {
      status: status === 'running' && !connectionId ? 'new' : status,
      step,
      connectionId,
      schema: typeof v.schema === 'string' && v.schema ? v.schema : 'main',
    }
  } catch {
    return initialTourState()
  }
}
