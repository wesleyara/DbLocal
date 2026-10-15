<script setup lang="ts">
/**
 * The shortcut list of the "Keyboard shortcuts" article. It reads the live registry (the same one
 * the dispatcher, the cheat sheet and the palette use), so the article cannot drift from the app.
 */
const { t } = useI18n()
const { grouped, format } = useShortcuts()
</script>

<template>
  <div class="flex flex-col gap-6" data-help-shortcuts-table>
    <section v-for="group in grouped" :key="group.context" class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold text-fg">{{ t(`shortcuts.contexts.${group.context}`) }}</h3>
      <ul class="!m-0 !list-none divide-y divide-border rounded-md border border-border !p-0">
        <li v-for="item in group.items" :key="item.id" class="!my-0 flex items-center justify-between gap-4 px-3 py-1.5 text-sm">
          <span class="text-fg-muted">{{ t(item.description) }}</span>
          <span class="flex shrink-0 gap-0.5"><UiKbd v-for="part in format(item.keys)" :key="part">{{ part }}</UiKbd></span>
        </li>
      </ul>
    </section>
  </div>
</template>
