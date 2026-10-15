<script setup lang="ts">
import { HELP_HINTS, type HelpHintId } from '#shared/help-hints'

/**
 * A discreet "?" next to a complex control. The popover holds a short text from the locale files
 * (`help.hints.<id>`) and a "Learn more" link that opens the article in the help drawer, so the
 * user keeps their place. Keyboard: Tab to the button, Enter/Space opens, Esc closes.
 */
const props = defineProps<{ id: HelpHintId }>()
const { t } = useI18n()
const { openDrawer } = useHelp()
const open = ref(false)
const def = computed(() => HELP_HINTS[props.id])
const topic = computed(() => t(`help.hints.${props.id}.title`))

function learnMore() {
  open.value = false
  openDrawer(def.value)
}
</script>

<template>
  <UiPopover v-model:open="open">
    <template #trigger>
      <button
        type="button"
        class="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-fg-subtle hover:text-fg focus-visible:text-fg"
        :aria-label="t('help.hintLabel', { topic })"
        :data-help-hint="id"
      >
        <Icon name="lucide:circle-help" class="size-3.5" />
      </button>
    </template>
    <div class="flex w-64 flex-col gap-2" role="note">
      <p class="text-xs font-medium text-fg">{{ topic }}</p>
      <p class="text-xs leading-relaxed text-fg-muted">{{ t(`help.hints.${id}.text`) }}</p>
      <button type="button" class="self-start text-xs font-medium text-accent hover:underline" data-help-learn-more @click="learnMore">
        {{ t('help.learnMore') }} →
      </button>
    </div>
  </UiPopover>
</template>
