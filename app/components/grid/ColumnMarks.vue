<script setup lang="ts">
import type { SchemaColumn } from '#shared/types/db'

/** The same markers the diagram draws: `?` nullable, `U` unique, `D` default or generated. */
const props = defineProps<{ column: SchemaColumn | undefined; primaryKey: boolean; uniques: string[][] }>()
const { t } = useI18n()

const single = computed(() => props.uniques.some((u) => u.length === 1 && u[0] === props.column?.name))
const composite = computed(() => props.uniques.filter((u) => u.length > 1 && u.includes(props.column?.name ?? '')))
const unique = computed(() => single.value || composite.value.length > 0)
const hasDefault = computed(() => !!props.column && (props.column.default !== null || props.column.isGenerated))
const nullable = computed(() => !!props.column && props.column.nullable && !props.primaryKey)

const uniqueTitle = computed(() =>
  [single.value ? t('erd.unique') : null, ...composite.value.map((g) => `${t('erd.unique')} (${g.join(', ')})`)]
    .filter(Boolean)
    .join(' · '),
)
const defaultTitle = computed(() =>
  props.column?.default !== null && props.column?.default !== undefined
    ? `${t('erd.default')}: ${props.column.default}`
    : t('erd.default'),
)
</script>

<template>
  <span v-if="nullable" class="shrink-0 text-fg-subtle" :title="t('erd.nullable')">?</span>
  <span
    v-if="unique"
    class="shrink-0 rounded-[3px] border border-accent/40 px-0.5 text-[9px] font-semibold leading-3 text-accent"
    :title="uniqueTitle"
  >U</span>
  <span
    v-if="hasDefault"
    class="shrink-0 rounded-[3px] border border-border-strong px-0.5 text-[9px] font-semibold leading-3 text-fg-subtle"
    :title="defaultTitle"
  >D</span>
</template>
