<script setup lang="ts">
const { t } = useI18n()
const open = defineModel<boolean>('open', { default: false })
const { grouped, format } = useShortcuts()
</script>

<template>
  <UiDialog v-model:open="open" wide :title="t('shortcuts.title')" :description="t('shortcuts.description')">
    <div class="grid gap-x-8 gap-y-5 sm:grid-cols-2" data-shortcuts-sheet>
      <section v-for="group in grouped" :key="group.context">
        <h3 class="mb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t(`shortcuts.contexts.${group.context}`) }}</h3>
        <ul class="divide-y divide-border">
          <li v-for="item in group.items" :key="item.id" class="flex items-center justify-between gap-3 py-1.5 text-sm">
            <span class="text-fg">{{ t(item.description) }}</span>
            <span class="flex shrink-0 gap-0.5">
              <UiKbd v-for="part in format(item.keys)" :key="part">{{ part }}</UiKbd>
            </span>
          </li>
        </ul>
      </section>
    </div>
  </UiDialog>
</template>
