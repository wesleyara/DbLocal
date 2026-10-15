<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { ERD_HEADER_HEIGHT, ERD_ROW_HEIGHT, handleId, type ErdTable } from '#shared/erd'
import { ERD_UI } from './state'

const props = defineProps<{ id: string; data: { table: ErdTable } }>()
const { t } = useI18n()
const ui = inject(ERD_UI)!

const table = computed(() => props.data.table)
const dimmed = computed(() => ui.selected !== null && !ui.neighbours.has(props.id))
const isSelected = computed(() => ui.selected === props.id)

const handleTop = (index: number) =>
  ui.compact ? ERD_HEADER_HEIGHT / 2 : ERD_HEADER_HEIGHT + index * ERD_ROW_HEIGHT + ERD_ROW_HEIGHT / 2
function tooltip(c: ErdTable['columns'][number]): string {
  const parts = [`${c.name}: ${c.type}${c.nullable ? '' : ' NOT NULL'}`]
  if (c.pk) parts.push(t('erd.primaryKey'))
  if (c.references) parts.push(`→ ${c.references}`)
  if (c.unique) parts.push(t('erd.unique'))
  for (const group of c.uniqueWith) parts.push(`${t('erd.unique')} (${group.join(', ')})`)
  if (c.default !== null) parts.push(`${t('erd.default')}: ${c.default}`)
  else if (c.generated) parts.push(t('erd.generated'))
  return parts.join('\n')
}
const lit = (column: string) => ui.hoverColumns.has(`${props.id}.${column}`)
</script>

<template>
  <div
    class="erd-node overflow-visible rounded-md border bg-surface text-fg shadow-sm transition-opacity"
    :class="[
      isSelected ? 'border-accent ring-1 ring-accent' : 'border-border-strong',
      dimmed && 'opacity-30',
      table.kind !== 'table' && 'border-dashed',
    ]"
    :data-table="id"
  >
    <header
      class="font-data flex items-center gap-1.5 truncate rounded-t-md bg-bg-subtle px-2 font-semibold"
      :class="ui.compact ? 'h-14 rounded-b-md text-2xl' : 'text-xs'"
      :style="ui.compact ? undefined : { height: `${ERD_HEADER_HEIGHT}px` }"
    >
      <Icon :name="table.kind === 'table' ? 'lucide:table-2' : 'lucide:eye'" class="shrink-0 text-fg-subtle" :class="ui.compact ? 'size-6' : 'size-3.5'" />
      <span class="truncate">{{ id }}</span>
    </header>

    <ul v-if="!ui.compact">
      <li
        v-for="c in table.columns"
        :key="c.name"
        class="font-data flex items-center gap-1.5 border-t border-border px-2 text-xs"
        :class="lit(c.name) && 'bg-accent-soft'"
        :style="{ height: `${ERD_ROW_HEIGHT}px` }"
        :title="tooltip(c)"
      >
        <span class="inline-flex w-4 shrink-0 justify-center">
          <Icon v-if="c.pk" name="lucide:key-round" class="size-3 text-warning" :title="t('erd.primaryKey')" />
          <Icon v-else-if="c.fk" name="lucide:link-2" class="size-3 text-accent" :title="t('erd.foreignKey')" />
        </span>
        <span class="truncate" :class="c.nullable && 'text-fg-muted'">{{ c.name }}</span>
        <span v-if="c.nullable && !c.pk" class="text-fg-subtle" aria-hidden="true">?</span>
        <span v-if="c.unique || c.uniqueWith.length" class="shrink-0 rounded-[3px] border border-accent/40 px-0.5 text-[9px] font-semibold leading-3 text-accent">U</span>
        <span v-if="c.default !== null || c.generated" class="shrink-0 rounded-[3px] border border-border-strong px-0.5 text-[9px] font-semibold leading-3 text-fg-subtle">D</span>
        <span class="ml-auto truncate pl-2 text-[10px] text-fg-subtle">{{ c.type }}</span>
      </li>
      <li
        v-if="table.hiddenColumns > 0"
        class="flex items-center border-t border-border px-2 text-xs text-fg-subtle"
        :style="{ height: `${ERD_ROW_HEIGHT}px` }"
      >
        {{ t('erd.moreColumns', { count: table.hiddenColumns }) }}
      </li>
    </ul>

    <template v-for="(c, i) in [{ name: '' }, ...table.columns]" :key="c.name">
      <Handle :id="handleId(c.name, 'l')" type="source" :position="Position.Left" class="erd-handle" :style="{ top: `${c.name === '' ? ERD_HEADER_HEIGHT / 2 : handleTop(i - 1)}px` }" />
      <Handle :id="handleId(c.name, 'r')" type="source" :position="Position.Right" class="erd-handle" :style="{ top: `${c.name === '' ? ERD_HEADER_HEIGHT / 2 : handleTop(i - 1)}px` }" />
    </template>
  </div>
</template>

<style scoped>
.erd-node {
  width: 248px;
}
.erd-handle {
  width: 8px;
  height: 8px;
  min-width: 0;
  border: 1px solid var(--accent);
  background: var(--bg);
  opacity: 0;
  transform: translateY(-50%);
}
.erd-node:hover .erd-handle {
  opacity: 0.9;
}
.erd-handle.connectingto {
  opacity: 1;
  background: var(--accent);
}
</style>
