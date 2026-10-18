/**
 * Contextual help: every `HelpHint` in the UI is one entry here. `slug` and `anchor` must exist in
 * `content/help/<locale>/` (a unit test checks both locales) and the short text lives in the
 * locale files under `help.hints.<id>`. Nothing about a hint is written in the feature component.
 */
export interface HelpHintDef {
  slug: string
  /** Heading id inside the article (`## Add a virtual relation` -> `add-a-virtual-relation`). */
  anchor: string
}

export const HELP_HINTS = {
  'connection.ssl': { slug: 'connections', anchor: 'ssl' },
  'connection.ssh': { slug: 'connections', anchor: 'ssh-tunnel' },
  'connection.environment': { slug: 'connections', anchor: 'environment-and-read-only' },
  'relations.virtual': { slug: 'schema-browser', anchor: 'add-a-virtual-relation' },
  'relations.display': { slug: 'schema-browser', anchor: 'display-column' },
  'grid.filters': { slug: 'data-grid', anchor: 'filter' },
  'grid.pending': { slug: 'editing', anchor: 'saving' },
  'grid.prod': { slug: 'editing', anchor: 'saving' },
  'sql.limits': { slug: 'sql-editor', anchor: 'running' },
  'sql.readonly': { slug: 'sql-editor', anchor: 'safety' },
  'sql.alertBeforeRun': { slug: 'sql-editor', anchor: 'alert-before-run' },
  'erd.layout': { slug: 'erd', anchor: 'layout' },
  'notes.overview': { slug: 'notes', anchor: 'writing' },
  'routines.overview': { slug: 'routines', anchor: 'safety' },
} as const satisfies Record<string, HelpHintDef>

export type HelpHintId = keyof typeof HELP_HINTS

/** Empty states that link to an article (no popover, a plain "Learn more"). */
export const HELP_EMPTY_STATES = {
  noConnection: { slug: 'connections', anchor: 'add-a-connection' },
  noPrimaryKey: { slug: 'data-grid', anchor: 'tables-without-a-primary-key' },
  noResults: { slug: 'data-grid', anchor: 'filter' },
} as const satisfies Record<string, HelpHintDef>
