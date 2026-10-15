<script setup lang="ts">
import { HELP_EMPTY_STATES } from '#shared/help-hints'

/** "Learn more" under an empty state; opens the article in the help drawer. */
const props = defineProps<{ topic: keyof typeof HELP_EMPTY_STATES }>()
const { t } = useI18n()
const { openDrawer } = useHelp()
</script>

<template>
  <button
    type="button"
    class="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
    data-help-empty-link
    @click="openDrawer(HELP_EMPTY_STATES[props.topic])"
  >
    <Icon name="lucide:circle-help" class="size-3.5" />{{ t('help.learnMore') }}
  </button>
</template>
