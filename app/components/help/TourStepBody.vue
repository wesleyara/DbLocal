<script setup lang="ts">
import { useTourStore } from '~/stores/tour'

/** Content of one tour step: texts from the locale files, progress and the Back / Next / Skip controls. */
const { t } = useI18n()
const tour = useTourStore()
const { format } = useShortcuts()
const isLast = computed(() => tour.index === tour.total - 1)
</script>

<template>
  <div class="flex flex-col gap-3" data-tour-step :data-step="tour.step.id">
    <div class="flex items-center justify-between text-xs text-fg-subtle">
      <span>{{ t('tour.progress', { current: tour.index + 1, total: tour.total }) }}</span>
      <button type="button" class="hover:text-fg" data-tour-skip @click="tour.skip()">{{ t('tour.skip') }}</button>
    </div>
    <div class="flex flex-col gap-1.5">
      <h2 class="text-sm font-semibold text-fg">{{ t(`tour.steps.${tour.step.id}.title`) }}</h2>
      <p class="text-sm leading-relaxed text-fg-muted">{{ t(`tour.steps.${tour.step.id}.body`) }}</p>
      <p v-if="tour.step.id === 'palette'" class="flex items-center gap-1 text-xs text-fg-subtle">
        <UiKbd v-for="part in format('mod+k')" :key="part">{{ part }}</UiKbd>
      </p>
    </div>
    <div class="flex items-center justify-between gap-2">
      <UiButton size="sm" variant="ghost" :disabled="tour.index === 0" data-tour-back @click="tour.back()">{{ t('tour.back') }}</UiButton>
      <UiButton size="sm" variant="primary" data-tour-next @click="tour.next()">
        {{ isLast ? t('tour.finish') : t('tour.next') }}
      </UiButton>
    </div>
  </div>
</template>
