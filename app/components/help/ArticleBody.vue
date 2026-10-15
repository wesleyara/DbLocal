<script setup lang="ts">
const props = defineProps<{ html: string }>()
const emit = defineEmits<{ navigate: [target: { slug: string; anchor: string | null }] }>()

const { t } = useI18n()
const ui = useUiStore()
const root = ref<HTMLElement | null>(null)
const shortcutsHost = ref<HTMLElement | null>(null)
const zoomed = ref<{ src: string; alt: string } | null>(null)
const zoomOpen = computed({
  get: () => zoomed.value !== null,
  set: (v) => {
    if (!v) zoomed.value = null
  },
})

/** Callout labels and per-theme screenshots are applied after the HTML is in the DOM. */
function decorate() {
  const el = root.value
  if (!el) return
  el.querySelectorAll<HTMLElement>('.help-callout').forEach((callout) => {
    if (callout.querySelector('.help-callout-label')) return
    const kind = (/help-callout-(info|warning|danger)/.exec(callout.className)?.[1] ?? 'info') as 'info' | 'warning' | 'danger'
    const label = document.createElement('strong')
    label.className = 'help-callout-label'
    label.textContent = t(`help.callout.${kind}`)
    callout.prepend(label)
  })
  // The shortcuts article marks where the live registry goes; a component is teleported there.
  shortcutsHost.value = el.querySelector<HTMLElement>('[data-help-shortcuts]')
  el.querySelectorAll<HTMLButtonElement>('[data-help-copy]').forEach((b) => b.setAttribute('aria-label', t('help.copy')))
  const dark = document.documentElement.dataset.theme !== 'light'
  el.querySelectorAll<HTMLImageElement>('img[data-help-src]').forEach((img) => {
    img.src = img.dataset.helpSrc!.replace('{theme}', dark ? 'dark' : 'light')
  })
}

watch(() => [props.html, ui.theme] as const, () => nextTick(decorate), { flush: 'post' })
onMounted(decorate)

async function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  const copy = target.closest<HTMLElement>('[data-help-copy]')
  if (copy) {
    const text = copy.parentElement?.querySelector('code')?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(text)
      copy.setAttribute('data-copied', '')
      copy.setAttribute('aria-label', t('help.copied'))
      setTimeout(() => {
        copy.removeAttribute('data-copied')
        copy.setAttribute('aria-label', t('help.copy'))
      }, 1500)
    } catch {
      /* clipboard blocked: nothing to do */
    }
    return
  }
  const img = target.closest<HTMLImageElement>('img[data-help-zoom]')
  if (img) {
    zoomed.value = { src: img.currentSrc || img.src, alt: img.alt }
    return
  }
  const a = target.closest<HTMLAnchorElement>('a[href]')
  if (!a) return
  const href = a.getAttribute('href') ?? ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    return
  }
  event.preventDefault()
  if (href.startsWith('#')) {
    document.getElementById(href.slice(1))?.scrollIntoView({ block: 'start' })
    return
  }
  // `slug`, `slug#anchor` or `/help/slug#anchor`
  const [path, anchor] = href.replace(/^\/help\/?/, '').split('#')
  emit('navigate', { slug: path || '', anchor: anchor || null })
}
</script>

<template>
  <!-- The HTML comes from the Markdown files bundled with the app, never from user input. -->
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div ref="root" class="help-prose" data-help-article @click="onClick" v-html="html" />
  <Teleport v-if="shortcutsHost" :to="shortcutsHost"><HelpShortcutsTable /></Teleport>
  <UiDialog v-model:open="zoomOpen" :title="zoomed?.alt || t('help.zoom')" wide :close-label="t('help.closeImage')">
    <img v-if="zoomed" :src="zoomed.src" :alt="zoomed.alt" class="mx-auto max-h-[70vh] rounded-md border border-border">
  </UiDialog>
</template>
