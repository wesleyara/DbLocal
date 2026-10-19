// Persists the ui store in localStorage ('dblocal-ui') and applies the theme to <html>.
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:suspense:resolve', () => nextTick(init))
})

function init() {
  const ui = useUiStore()
  const KEY = 'dblocal-ui'

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (saved.theme) ui.theme = saved.theme
    if (typeof saved.sidebarWidth === 'number') ui.setSidebarWidth(saved.sidebarWidth)
    if (typeof saved.sidebarCollapsed === 'boolean') ui.sidebarCollapsed = saved.sidebarCollapsed
    if (typeof saved.statusBar === 'boolean') ui.statusBar = saved.statusBar
    if (typeof saved.recordPanelWidth === 'number') ui.setRecordPanelWidth(saved.recordPanelWidth)
    if (typeof saved.gridTools === 'boolean') ui.gridTools = saved.gridTools
    if (typeof saved.doubleCheck === 'boolean') ui.doubleCheck = saved.doubleCheck
  } catch {
    // corrupted storage: fall back to defaults
  }

  const media = matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const resolved = ui.theme === 'system' ? (media.matches ? 'dark' : 'light') : ui.theme
    document.documentElement.dataset.theme = resolved
  }
  apply()
  media.addEventListener('change', apply)

  watch(
    () => [ui.theme, ui.sidebarWidth, ui.sidebarCollapsed, ui.statusBar, ui.recordPanelWidth, ui.gridTools, ui.doubleCheck] as const,
    ([theme, sidebarWidth, sidebarCollapsed, statusBar, recordPanelWidth, gridTools, doubleCheck]) => {
      apply()
      try {
        localStorage.setItem(KEY, JSON.stringify({ theme, sidebarWidth, sidebarCollapsed, statusBar, recordPanelWidth, gridTools, doubleCheck }))
      } catch {
        // storage unavailable
      }
    },
  )
}
