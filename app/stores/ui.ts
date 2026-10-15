import { defineStore } from 'pinia'

export type ThemeMode = 'dark' | 'light' | 'system'

export const useUiStore = defineStore(
  'ui',
  () => {
    const theme = ref<ThemeMode>('system')
    const sidebarWidth = ref(260)
    const sidebarCollapsed = ref(false)
    const statusBar = ref(true)
    const recordPanelWidth = ref(420)
    /** SQL bar under the table grid; hidden until asked for. */
    const gridSql = ref(false)

    function setSidebarWidth(w: number) {
      sidebarWidth.value = Math.min(480, Math.max(200, Math.round(w)))
    }

    function setRecordPanelWidth(w: number) {
      recordPanelWidth.value = Math.min(900, Math.max(320, Math.round(w)))
    }

    return { theme, sidebarWidth, sidebarCollapsed, statusBar, recordPanelWidth, gridSql, setSidebarWidth, setRecordPanelWidth }
  },
)
