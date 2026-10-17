import type { Note } from '#shared/schemas/notes'

export type NoteStatus = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

export interface NoteTarget {
  /** `GET`/`PUT` endpoint of the note. */
  url: string
  /** Sent as `?schema=` and in the body, for table notes. */
  schema?: string
}

const SAVE_DELAY = 700

/**
 * A Markdown note (connection or table) loaded from the server and saved as the user types
 * (debounced). Changing the target saves what is pending on the old one first.
 * Leaving the page flushes the pending save.
 */
export function useNote(target: () => NoteTarget | null) {
  const content = ref('')
  const updatedAt = ref<string | null>(null)
  const status = ref<NoteStatus>('idle')
  /** Content as the server has it, so loading never triggers a save. */
  let saved = ''
  let current: NoteTarget | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let generation = 0

  async function save(to: NoteTarget, text: string): Promise<void> {
    status.value = 'saving'
    try {
      const note = await $fetch<Note>(to.url, { method: 'PUT', body: to.schema ? { schema: to.schema, content: text } : { content: text } })
      if (to === current) {
        saved = text
        updatedAt.value = note.updatedAt
        status.value = content.value === text ? 'saved' : status.value
      }
    } catch {
      if (to === current) status.value = 'error'
    }
  }

  /** Saves now whatever is pending. */
  async function flush(): Promise<void> {
    if (timer) clearTimeout(timer)
    timer = null
    if (current && content.value !== saved) await save(current, content.value)
  }

  async function load(to: NoteTarget | null): Promise<void> {
    await flush()
    const mine = ++generation
    current = to
    saved = ''
    content.value = ''
    updatedAt.value = null
    if (!to) return void (status.value = 'idle')
    status.value = 'loading'
    try {
      const note = await $fetch<Note>(to.url, { query: to.schema ? { schema: to.schema } : undefined })
      if (mine !== generation) return
      saved = note.content
      content.value = note.content
      updatedAt.value = note.updatedAt
      status.value = 'idle'
    } catch {
      if (mine === generation) status.value = 'error'
    }
  }

  watch(content, (text) => {
    if (!current || status.value === 'loading' || text === saved) return
    if (timer) clearTimeout(timer)
    const to = current
    timer = setTimeout(() => {
      timer = null
      void save(to, text)
    }, SAVE_DELAY)
  })

  watch(() => JSON.stringify(target()), () => void load(target()), { immediate: true })
  onBeforeUnmount(() => void flush())

  const hasContent = computed(() => content.value.trim().length > 0)
  return { content, updatedAt, status, hasContent, flush, reload: () => load(current) }
}
