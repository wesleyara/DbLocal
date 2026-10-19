<script setup lang="ts">
import { DEFAULT_QUERY_LIMIT, DEFAULT_QUERY_TIMEOUT_MS } from '#shared/types/query'
import type { ThemeMode } from '~/stores/ui'
import { useQueriesStore } from '~/stores/queries'
import { useUiStore } from '~/stores/ui'

const { t, locale, locales, setLocale } = useI18n()
const open = defineModel<boolean>('open', { default: false })
const ui = useUiStore()
const queries = useQueriesStore()

const themes: { value: ThemeMode; icon: string; label: string }[] = [
  { value: 'light', icon: 'lucide:sun', label: 'theme.light' },
  { value: 'dark', icon: 'lucide:moon', label: 'theme.dark' },
  { value: 'system', icon: 'lucide:monitor', label: 'theme.system' },
]
const localeOptions = computed(() => locales.value.map((l) => ({ value: l.code, label: l.name ?? l.code })))

const limit = computed({
  get: () => String(queries.limit),
  set: (v) => {
    const n = Number.parseInt(String(v), 10)
    if (Number.isInteger(n) && n > 0) queries.limit = Math.min(n, 100_000)
  },
})
const timeoutSeconds = computed({
  get: () => String(Math.round(queries.timeoutMs / 1000)),
  set: (v) => {
    const n = Number.parseInt(String(v), 10)
    if (Number.isInteger(n) && n > 0) queries.timeoutMs = Math.min(n, 600) * 1000
  },
})
function resetQuery() {
  queries.limit = DEFAULT_QUERY_LIMIT
  queries.timeoutMs = DEFAULT_QUERY_TIMEOUT_MS
}
</script>

<template>
  <UiDialog v-model:open="open" :title="t('settings.title')" :description="t('settings.description')">
    <div class="space-y-5" data-settings>
      <section>
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('settings.appearance') }}</h3>
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-fg">{{ t('settings.theme') }}</span>
          <div class="inline-flex rounded-md border border-border bg-bg-subtle p-0.5" role="radiogroup" :aria-label="t('settings.theme')">
            <button
              v-for="option in themes"
              :key="option.value"
              type="button"
              role="radio"
              :aria-checked="ui.theme === option.value"
              :aria-label="t(option.label)"
              :title="t(option.label)"
              class="inline-flex size-7 items-center justify-center rounded-sm text-fg-muted hover:text-fg"
              :class="ui.theme === option.value && 'bg-surface text-fg shadow-sm'"
              @click="ui.theme = option.value"
            >
              <Icon :name="option.icon" class="size-4" />
            </button>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="text-sm text-fg">{{ t('settings.language') }}</span>
          <UiSelect :model-value="locale" :options="localeOptions" @update:model-value="(v) => v && setLocale(v as 'en' | 'pt-BR')" />
        </div>
        <div class="mt-3 flex items-center justify-between gap-3">
          <span class="text-sm text-fg">{{ t('settings.statusBar') }}</span>
          <UiSwitch v-model="ui.statusBar" :label="''" />
        </div>
      </section>

      <section>
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('settings.queries') }}</h3>
        <div class="flex items-center justify-between gap-3">
          <label for="settings-limit" class="text-sm text-fg">{{ t('settings.rowLimit') }}</label>
          <UiInput id="settings-limit" v-model="limit" mono class="!w-28 text-right" inputmode="numeric" />
        </div>
        <div class="mt-3 flex items-center justify-between gap-3">
          <label for="settings-timeout" class="text-sm text-fg">{{ t('settings.timeout') }}</label>
          <UiInput id="settings-timeout" v-model="timeoutSeconds" mono class="!w-28 text-right" inputmode="numeric" />
        </div>
        <div class="mt-3 flex justify-end">
          <UiButton size="sm" variant="ghost" @click="resetQuery">{{ t('settings.reset') }}</UiButton>
        </div>
      </section>

      <section data-settings-safety>
        <h3 class="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('settings.safety') }}</h3>
        <div class="flex items-center justify-between gap-3">
          <span class="inline-flex items-center gap-1 text-sm text-fg">{{ t('settings.doubleCheck') }}<HelpHint id="safety.doubleCheck" /></span>
          <UiSwitch v-model="ui.doubleCheck" :label="''" data-double-check />
        </div>
        <p class="mt-1 text-xs text-fg-subtle">{{ t('settings.doubleCheckHint') }}</p>
      </section>

      <BackupWorkspaceBackup />
    </div>
  </UiDialog>
</template>
