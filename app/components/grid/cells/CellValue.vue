<script setup lang="ts">
import type { ColumnKind } from '#shared/types/db'
import type { BinaryPreview } from '#shared/types/rows'

/** Longest text kept in the DOM per cell. Bigger JSON or text is cut here, the viewer shows the rest. */
const PREVIEW_CHARS = 300

const props = defineProps<{ value: unknown; kind: ColumnKind }>()
const { t } = useI18n()
const { number, date } = useFormat()

const isNull = computed(() => props.value === null || props.value === undefined)

const binary = computed<BinaryPreview | null>(() => {
  if (props.kind !== 'binary' || typeof props.value !== 'object' || props.value === null) return null
  return props.value as BinaryPreview
})

/** First bytes as hex, for the cell. Decoding only the head keeps this cheap for big blobs. */
const hexHead = computed(() => {
  if (!binary.value) return ''
  const bytes = atob(binary.value.$binary.slice(0, 32))
  return Array.from(bytes, (ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
})

/**
 * JSON text cut after `limit` characters. It walks the value and stops early, so a 1 MB document
 * costs a few hundred characters of work per render instead of a full `JSON.stringify`.
 */
function boundedJson(value: unknown, limit: number): string {
  let out = ''
  const full = () => out.length > limit
  const walk = (v: unknown): void => {
    if (full()) return
    if (v === null || typeof v !== 'object') {
      out += JSON.stringify(v) ?? 'null'
      return
    }
    if (Array.isArray(v)) {
      out += '['
      for (let i = 0; i < v.length && !full(); i++) {
        if (i) out += ','
        walk(v[i])
      }
      out += ']'
      return
    }
    out += '{'
    let first = true
    for (const key in v as Record<string, unknown>) {
      if (full()) break
      if (!first) out += ','
      first = false
      out += `${JSON.stringify(key)}:`
      walk((v as Record<string, unknown>)[key])
    }
    out += '}'
  }
  walk(value)
  return out
}

const text = computed(() => {
  if (isNull.value || binary.value) return ''
  if (props.kind === 'json' || props.kind === 'array') {
    return typeof props.value === 'string' ? props.value : boundedJson(props.value, PREVIEW_CHARS)
  }
  return String(props.value)
})

const shown = computed(() => (text.value.length > PREVIEW_CHARS ? `${text.value.slice(0, PREVIEW_CHARS)}…` : text.value))

const isTemporal = computed(() => props.kind === 'date' || props.kind === 'datetime')
/** Enum values get a stable colour from their text, so the same value always looks the same. */
const BADGE_TONES = ['accent', 'success', 'warning', 'danger', 'neutral'] as const
const enumTone = computed(() => {
  let hash = 0
  for (const ch of text.value) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return BADGE_TONES[hash % BADGE_TONES.length]
})

/** ISO instant plus the viewer's timezone, shown on hover of a date cell. */
const temporalTitle = computed(() => {
  if (!isTemporal.value || isNull.value) return undefined
  const d = new Date(String(props.value))
  if (Number.isNaN(d.getTime())) return undefined
  return `${d.toISOString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`
})

const temporalLabel = computed(() => {
  if (!isTemporal.value || isNull.value) return ''
  const d = new Date(String(props.value))
  return Number.isNaN(d.getTime()) ? text.value : date(d, props.kind === 'date' ? { dateStyle: 'medium' } : undefined)
})
</script>

<template>
  <span
    class="block min-w-0 truncate leading-7"
    :class="[props.kind === 'number' && 'text-right tabular-nums text-type-number', props.kind === 'json' && 'text-type-json', isTemporal && 'text-type-date', props.kind === 'boolean' && 'text-type-boolean']"
    :title="temporalTitle ?? (isNull ? undefined : text.slice(0, 500))"
  >
    <!-- NULL is a badge, never the string "NULL", so it cannot be confused with an empty string. -->
    <span v-if="isNull" class="rounded-sm border border-border px-1 text-[10px] uppercase tracking-wide text-type-null italic">{{ t('grid.null') }}</span>

    <template v-else-if="props.kind === 'boolean'">
      <Icon v-if="props.value === true || props.value === 1 || props.value === '1' || props.value === 't'" name="lucide:check" class="inline size-3.5 text-success" :aria-label="t('common.yes')" />
      <Icon v-else name="lucide:x" class="inline size-3.5 text-fg-subtle" :aria-label="t('common.no')" />
    </template>

    <template v-else-if="binary">
      <span class="text-fg-muted">{{ t('grid.binaryBytes', { size: number(binary.size) }) }}</span>
      <span class="ml-1 text-fg-subtle">{{ hexHead }}{{ binary.size > 16 ? ' …' : '' }}</span>
      <span v-if="binary.truncated" class="ml-1 text-warning">{{ t('grid.truncated') }}</span>
    </template>

    <template v-else-if="isTemporal">{{ temporalLabel }}</template>

    <UiBadge v-else-if="props.kind === 'enum'" :tone="enumTone">{{ shown }}</UiBadge>

    <template v-else>{{ shown }}</template>
  </span>
</template>
