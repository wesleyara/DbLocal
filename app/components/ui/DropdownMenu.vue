<script setup lang="ts">
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from 'reka-ui'

export interface MenuItem {
  label: string
  icon?: string
  danger?: boolean
  separator?: boolean
  onSelect?: () => void
}
defineProps<{ items: MenuItem[] }>()
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger as-child><slot /></DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        :side-offset="4"
        align="end"
        class="z-50 min-w-40 rounded-md border border-border bg-surface p-1 shadow-pop"
      >
        <template v-for="(item, i) in items" :key="i">
          <DropdownMenuSeparator v-if="item.separator" class="my-1 h-px bg-border" />
          <DropdownMenuItem
            v-else
            class="flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none data-[highlighted]:bg-surface-hover"
            :class="item.danger ? 'text-danger' : 'text-fg'"
            @select="item.onSelect?.()"
          >
            <Icon v-if="item.icon" :name="item.icon" class="size-4" />
            {{ item.label }}
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>
