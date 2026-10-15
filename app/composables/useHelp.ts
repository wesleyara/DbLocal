/** Where a help article lives: `slug` and an optional heading `anchor`. */
export interface HelpTarget {
  slug: string
  anchor?: string | null
}

export const HELP_HOME_SLUG = 'getting-started'

/** `/help/<slug>#anchor` for a target; `/help` for the home. */
export function helpPath(target?: HelpTarget | null): string {
  if (!target?.slug) return '/help'
  return `/help/${target.slug}${target.anchor ? `#${target.anchor}` : ''}`
}

/**
 * Help from anywhere: `openCentre` goes to the full page, `openDrawer` shows an article in a side
 * drawer without leaving what the user is doing (used by `HelpHint`).
 */
export function useHelp() {
  const drawer = useState('help-drawer', () => ({ open: false, slug: HELP_HOME_SLUG, anchor: null as string | null }))

  function openDrawer(target: HelpTarget) {
    drawer.value = { open: true, slug: target.slug, anchor: target.anchor ?? null }
  }

  function closeDrawer() {
    drawer.value = { ...drawer.value, open: false }
  }

  function openCentre(target?: HelpTarget | null) {
    closeDrawer()
    return navigateTo(helpPath(target))
  }

  return { drawer, openDrawer, closeDrawer, openCentre }
}
