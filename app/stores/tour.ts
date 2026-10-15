import { defineStore } from 'pinia'
import { initialTourState, readTourState, TOUR_STEPS, tourPath, type TourState } from '#shared/tour'
import type { ConnectionView } from '#shared/types/connection'

const KEY = 'dblocal-tour'
const LANGUAGE_KEY = 'dblocal-language-chosen'

/**
 * The first-use tour. Progress lives in localStorage, so a skipped or finished tour never comes
 * back on its own and a reload resumes where it was. It runs on the demo database only.
 */
export const useTourStore = defineStore('tour', () => {
  const state = ref<TourState>(initialTourState())
  const loaded = ref(false)
  const busy = ref(false)
  /** The first-run language question was answered (it comes before the tour is offered). */
  const languageChosen = ref(true)

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state.value))
    } catch {
      /* storage blocked: the tour still works for this session */
    }
  }

  function hydrate() {
    if (loaded.value) return
    loaded.value = true
    try {
      state.value = readTourState(localStorage.getItem(KEY))
      languageChosen.value = localStorage.getItem(LANGUAGE_KEY) === '1'
    } catch {
      state.value = initialTourState()
    }
  }

  function chooseLanguage() {
    languageChosen.value = true
    try {
      localStorage.setItem(LANGUAGE_KEY, '1')
    } catch {
      /* storage blocked: asked again next time */
    }
  }

  const active = computed(() => state.value.status === 'running')
  const offered = computed(() => loaded.value && state.value.status === 'new')
  const step = computed(() => TOUR_STEPS[state.value.step] ?? TOUR_STEPS[0]!)
  const index = computed(() => state.value.step)
  const total = TOUR_STEPS.length

  function pathOf(i: number): string {
    const s = TOUR_STEPS[i]!
    return tourPath(s.id, { connectionId: state.value.connectionId!, schema: state.value.schema })
  }

  /** Opens (or creates) the demo database and starts the tour on it. Safe to call again to redo it. */
  async function start() {
    busy.value = true
    try {
      const demo = await $fetch<ConnectionView>('/api/demo', { method: 'POST' })
      state.value = { status: 'running', step: 0, connectionId: demo.id, schema: demo.defaultSchema ?? 'main' }
      persist()
      await navigateTo(pathOf(0))
    } finally {
      busy.value = false
    }
  }

  async function goTo(i: number) {
    state.value = { ...state.value, step: Math.min(Math.max(i, 0), total - 1) }
    persist()
    await navigateTo(pathOf(state.value.step))
  }

  async function next() {
    if (state.value.step >= total - 1) return finish()
    await goTo(state.value.step + 1)
  }

  async function back() {
    await goTo(state.value.step - 1)
  }

  function finish() {
    state.value = { ...state.value, status: 'done' }
    persist()
  }

  function skip() {
    state.value = { ...state.value, status: 'skipped' }
    persist()
  }

  /** Lets the user stop for now without marking it done: it can still be resumed from /help. */
  function dismissOffer() {
    skip()
  }

  return { state, loaded, busy, languageChosen, chooseLanguage, active, offered, step, index, total, hydrate, start, next, back, finish, skip, dismissOffer }
})
