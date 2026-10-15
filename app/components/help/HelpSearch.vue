<script setup lang="ts">
import { highlightParts, queryTerms, type HelpHit } from '#shared/help'

const props = defineProps<{ autofocus?: boolean }>()
const emit = defineEmits<{ open: [hit: { slug: string; anchor: string | null }] }>()
const { t, locale } = useI18n()

const query = ref('')
const hits = ref<HelpHit[]>([])
const searching = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0

watch(query, (q) => {
  clearTimeout(timer)
  if (!q.trim()) {
    hits.value = []
    searching.value = false
    return
  }
  searching.value = true
  timer = setTimeout(async () => {
    const mine = ++seq
    const result = await $fetch<HelpHit[]>('/api/help/search', { query: { q, locale: locale.value } }).catch(() => [])
    if (mine !== seq) return
    hits.value = result
    searching.value = false
  }, 150)
})

const terms = computed(() => queryTerms(query.value))
const parts = (text: string) => highlightParts(text, terms.value)
const active = computed(() => query.value.trim().length > 0)

defineExpose({ clear: () => (query.value = '') })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="relative">
      <Icon name="lucide:search" class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
      <UiInput
        v-model="query"
        class="!h-9 !pl-8 !pr-8"
        :placeholder="t('help.search')"
        :aria-label="t('help.search')"
        data-help-search
        :data-autofocus="props.autofocus ? '' : undefined"
        @keydown.esc="query = ''"
      />
      <button
        v-if="active"
        type="button"
        class="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-fg-subtle hover:text-fg"
        :aria-label="t('help.clearSearch')"
        @click="query = ''"
      >
        <Icon name="lucide:x" class="size-3.5" />
      </button>
    </div>

    <div v-if="active" class="flex flex-col" data-help-results aria-live="polite">
      <p v-if="!searching && hits.length === 0" class="py-6 text-center text-sm text-fg-muted">
        {{ t('help.noResults', { query }) }}
        <span class="mt-1 block text-xs text-fg-subtle">{{ t('help.noResultsHint') }}</span>
      </p>
      <template v-else>
        <p class="mb-1 text-xs text-fg-subtle">{{ t('help.results', { count: hits.length }) }}</p>
        <button
          v-for="hit in hits"
          :key="hit.slug"
          type="button"
          class="flex flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-surface-hover"
          data-help-hit
          @click="emit('open', { slug: hit.slug, anchor: hit.heading?.id ?? null })"
        >
          <span class="flex items-center gap-2 text-sm font-medium text-fg">
            <template v-for="(p, i) in parts(hit.title)" :key="i">
              <mark v-if="p.match" class="help-mark">{{ p.text }}</mark><template v-else>{{ p.text }}</template>
            </template>
            <span class="text-xs font-normal text-fg-subtle">{{ hit.category }}</span>
          </span>
          <span v-if="hit.heading" class="text-xs text-accent">› {{ hit.heading.text }}</span>
          <span class="text-xs text-fg-muted">
            <template v-for="(p, i) in parts(hit.snippet)" :key="i">
              <mark v-if="p.match" class="help-mark">{{ p.text }}</mark><template v-else>{{ p.text }}</template>
            </template>
          </span>
        </button>
      </template>
    </div>
  </div>
</template>
