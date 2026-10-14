<script setup lang="ts">
const props = defineProps<{
  total: number | null
  exact: boolean
  counting: boolean
  page: number
  pageSize: number
  shown: number
}>()
const emit = defineEmits<{
  page: [page: number]
  pageSize: [size: number]
  countExactly: []
}>()
const { t } = useI18n()
const { number } = useFormat()

const pageSizes = [50, 100, 250, 500]
/** Page size as a string for the select; picking a value reports it as a number. */
const sizeModel = computed({
  get: () => String(props.pageSize),
  set: (value: string | undefined) => {
    if (value) emit('pageSize', Number(value))
  },
})
const pages = computed(() => (props.total === null ? null : Math.max(1, Math.ceil(props.total / props.pageSize))))
const from = computed(() => (props.shown === 0 ? 0 : (props.page - 1) * props.pageSize + 1))
const to = computed(() => (props.shown === 0 ? 0 : from.value + props.shown - 1))

/** Jumps to the typed page, clamped to the known range. Empty or unchanged input does nothing. */
function goTo(raw: string): void {
  const n = Math.floor(Number(raw))
  if (!raw || Number.isNaN(n)) return
  const target = Math.min(Math.max(n, 1), pages.value ?? n)
  if (target !== props.page) emit('page', target)
}

/** Exact totals read "1–100 of 12,431"; estimates read "1–100 of ~1.2M" until the user asks for the count. */
const rangeText = computed(() => {
  if (props.total === null) return ''
  const total = props.exact
    ? number(props.total)
    : t('grid.rowsApprox', { total: number(props.total, { notation: 'compact', maximumFractionDigits: 1 }) })
  return t('grid.rowsRange', { from: number(from.value), to: number(to.value), total })
})
</script>

<template>
  <footer class="flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-fg-muted">
    <span class="font-data tabular-nums">{{ rangeText }}</span>
    <UiButton v-if="!exact && total !== null" size="sm" variant="ghost" :loading="counting" @click="emit('countExactly')">
      {{ t('grid.countExactly') }}
    </UiButton>

    <div class="ml-auto flex items-center gap-1">
      <label class="flex items-center gap-1">
        <span class="sr-only sm:not-sr-only">{{ t('grid.rowsPerPage') }}</span>
        <UiSelect v-model="sizeModel" :options="pageSizes.map((s) => ({ value: String(s), label: String(s) }))" />
      </label>
      <UiIconButton icon="lucide:chevrons-left" :label="t('grid.firstPage')" :disabled="page <= 1" @click="emit('page', 1)" />
      <UiIconButton icon="lucide:chevron-left" :label="t('grid.previousPage')" :disabled="page <= 1" @click="emit('page', page - 1)" />
      <input
        :key="page"
        type="number"
        min="1"
        :max="pages ?? undefined"
        :value="page"
        :aria-label="t('grid.goToPage')"
        class="font-data h-7 w-14 rounded-md border border-border bg-bg-subtle px-1 text-center text-sm tabular-nums text-fg focus:border-accent"
        @keydown.enter="goTo(($event.target as HTMLInputElement).value)"
        @blur="goTo(($event.target as HTMLInputElement).value)"
      >
      <span class="font-data tabular-nums">{{ pages === null ? '' : `/ ${number(pages)}` }}</span>
      <UiIconButton icon="lucide:chevron-right" :label="t('grid.nextPage')" :disabled="(pages !== null && page >= pages) || shown < pageSize" @click="emit('page', page + 1)" />
      <UiIconButton icon="lucide:chevrons-right" :label="t('grid.lastPage')" :disabled="pages === null || page >= pages" @click="pages && emit('page', pages)" />
    </div>
  </footer>
</template>
