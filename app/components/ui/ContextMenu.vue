<script setup lang="ts">
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from 'reka-ui'
import type { MenuItem } from './DropdownMenu.vue'

defineProps<{ items: MenuItem[] }>()
</script>

<template>
  <ContextMenuRoot>
    <ContextMenuTrigger as-child><slot /></ContextMenuTrigger>
    <ContextMenuPortal v-if="items.length">
      <ContextMenuContent class="ui-popup-scroll z-50 max-h-[min(24rem,var(--reka-context-menu-content-available-height))] min-w-40 max-w-[min(20rem,var(--reka-context-menu-content-available-width))] rounded-md border border-border bg-surface p-1 shadow-pop">
        <template v-for="(item, i) in items" :key="i">
          <ContextMenuSeparator v-if="item.separator" class="my-1 h-px bg-border" />
          <ContextMenuItem
            v-else
            class="flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-hover"
            :class="item.danger ? 'text-danger' : 'text-fg'"
            @select="item.onSelect?.()"
          >
            <Icon v-if="item.icon" :name="item.icon" class="size-4 shrink-0" />
            <span class="min-w-0 truncate" :title="item.label">{{ item.label }}</span>
          </ContextMenuItem>
        </template>
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>
