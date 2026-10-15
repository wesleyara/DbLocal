<script setup lang="ts">
import { useTourStore } from '~/stores/tour'

/** Invitation to take the tour: on the help home (always) and as a first-use offer (`floating`). */
const props = defineProps<{ floating?: boolean }>()
const { t } = useI18n()
const tour = useTourStore()
const { message } = useConnectionErrors()
const toast = useToast()
const { locale, locales, setLocale } = useI18n()
/** First run: the language is asked before the tour is offered. */
const askLanguage = computed(() => props.floating && !tour.languageChosen)
const options = computed(() => (locales.value as { code: string; name: string }[]).map((l) => ({ code: l.code, name: l.name })))
async function pick(code: string) {
  await setLocale(code as 'en' | 'pt-BR')
  tour.chooseLanguage()
}

async function start() {
  try {
    await tour.start()
  } catch (err) {
    toast.push({ kind: 'error', title: message(err) })
  }
}
</script>

<template>
  <section
    class="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
    :class="floating && 'pointer-events-auto fixed bottom-10 right-4 z-40 w-80 shadow-pop'"
    :aria-label="t('tour.title')"
    data-tour-offer
  >
    <template v-if="askLanguage">
      <Icon name="lucide:languages" class="mt-0.5 size-5 shrink-0 text-accent" />
      <div class="flex min-w-0 flex-1 flex-col gap-2" data-language-choice>
        <div>
          <h2 class="text-sm font-semibold text-fg">{{ t('tour.language.title') }}</h2>
          <p class="mt-0.5 text-xs text-fg-muted">{{ t('tour.language.description') }}</p>
        </div>
        <div class="flex gap-2">
          <UiButton
            v-for="o in options"
            :key="o.code"
            size="sm"
            :variant="o.code === locale ? 'primary' : 'secondary'"
            :data-language="o.code"
            @click="pick(o.code)"
          >
            {{ o.name }}
          </UiButton>
        </div>
      </div>
    </template>
    <template v-else>
    <Icon name="lucide:route" class="mt-0.5 size-5 shrink-0 text-accent" />
    <div class="flex min-w-0 flex-1 flex-col gap-2">
      <div>
        <h2 class="text-sm font-semibold text-fg">{{ t('tour.title') }}</h2>
        <p class="mt-0.5 text-xs text-fg-muted">{{ t('tour.description') }}</p>
      </div>
      <div class="flex gap-2">
        <UiButton size="sm" variant="primary" :loading="tour.busy" data-tour-start @click="start">{{ t('tour.start') }}</UiButton>
        <UiButton v-if="floating" size="sm" variant="ghost" data-tour-dismiss @click="tour.dismissOffer()">{{ t('tour.notNow') }}</UiButton>
      </div>
    </div>
    </template>
  </section>
</template>
