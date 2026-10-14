<script setup lang="ts">
/** Collapsible view of a JSON value. Objects and arrays open down to `openDepth`, deeper ones start closed. */
const props = withDefaults(defineProps<{ value: unknown; label?: string; depth?: number; openDepth?: number }>(), {
  depth: 0,
  openDepth: 2,
  label: undefined,
})
const { t } = useI18n()

const isContainer = (v: unknown): v is Record<string, unknown> | unknown[] => typeof v === 'object' && v !== null

const entries = computed(() => {
  const v = props.value
  if (!isContainer(v)) return []
  return Array.isArray(v) ? v.map((item, i) => [String(i), item] as const) : Object.entries(v)
})
const summary = computed(() => {
  const v = props.value
  if (!isContainer(v)) return ''
  const count = Array.isArray(v) ? v.length : Object.keys(v).length
  return Array.isArray(v) ? `[${count}]` : `{${count}}`
})

const open = ref(props.depth < props.openDepth)

function primitive(v: unknown): string {
  return typeof v === 'string' ? JSON.stringify(v) : String(v)
}
</script>

<template>
  <div class="font-data text-xs leading-5">
    <div v-if="isContainer(value)" class="flex items-center gap-1">
      <button type="button" class="inline-flex items-center gap-1 text-fg-muted hover:text-fg" :aria-expanded="open" @click="open = !open">
        <Icon :name="open ? 'lucide:chevron-down' : 'lucide:chevron-right'" class="size-3" />
        <span v-if="label !== undefined" class="text-accent">{{ label }}:</span>
        <span v-if="!open" class="text-fg-subtle">{{ summary }}</span>
      </button>
    </div>
    <div v-else class="flex gap-1">
      <span v-if="label !== undefined" class="text-accent">{{ label }}:</span>
      <span :class="value === null ? 'italic text-type-null' : typeof value === 'number' ? 'text-type-number' : typeof value === 'boolean' ? 'text-type-boolean' : 'text-type-string'">
        {{ value === null ? t('grid.null') : primitive(value) }}
      </span>
    </div>
    <div v-if="isContainer(value) && open" class="ml-3 border-l border-border pl-2">
      <JsonTree v-for="[key, item] in entries" :key="key" :value="item" :label="key" :depth="depth + 1" :open-depth="openDepth" />
    </div>
  </div>
</template>
