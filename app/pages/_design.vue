<script setup lang="ts">
if (!import.meta.dev) throw createError({ statusCode: 404 })

const { t } = useI18n()
const toast = useToast()
const text = ref('')
const checked = ref<boolean | 'indeterminate'>(true)
const on = ref(true)
const sel = ref('a')
const combo = ref('b')
const dialog = ref(false)
const drawer = ref(false)
const tab = ref('one')
const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]
const menu = [
  { label: t('design.item'), icon: 'lucide:copy' },
  { label: t('design.delete'), icon: 'lucide:trash-2', danger: true },
]
</script>

<template>
  <div class="space-y-6 p-6">
    <h1 class="text-xl font-semibold">{{ t('design.title') }}</h1>

    <section class="flex flex-wrap items-center gap-2">
      <UiButton variant="primary">{{ t('design.primary') }}</UiButton>
      <UiButton>{{ t('design.secondary') }}</UiButton>
      <UiButton variant="ghost">{{ t('design.ghost') }}</UiButton>
      <UiButton variant="danger">{{ t('design.danger') }}</UiButton>
      <UiButton loading>{{ t('design.loading') }}</UiButton>
      <UiIconButton icon="lucide:settings" :label="t('design.settings')" />
    </section>

    <section class="flex flex-wrap items-center gap-3">
      <UiInput v-model="text" class="max-w-48" :placeholder="t('design.input')" />
      <UiSelect v-model="sel" :options="options" />
      <UiCombobox v-model="combo" :options="options" :empty-text="t('design.empty')" />
      <UiCheckbox v-model="checked" :label="t('design.checkbox')" />
      <UiSwitch v-model="on" :label="t('design.switch')" />
    </section>

    <section class="flex flex-wrap items-center gap-2">
      <UiBadge>neutral</UiBadge>
      <UiBadge tone="accent">accent</UiBadge>
      <UiBadge tone="success">success</UiBadge>
      <UiBadge tone="warning">warning</UiBadge>
      <UiBadge tone="danger">danger</UiBadge>
      <UiKbd>⌘</UiKbd><UiKbd>K</UiKbd>
      <UiSpinner class="size-4" />
      <UiSkeleton class="h-4 w-24" />
    </section>

    <section class="font-data flex flex-wrap gap-4 text-sm">
      <span class="text-type-number">1,234.5</span>
      <span class="text-type-string">'text'</span>
      <span class="text-type-boolean">true</span>
      <span class="text-type-date">2026-10-14</span>
      <span class="text-type-json">{"a":1}</span>
      <span class="text-type-null">NULL</span>
      <span class="text-env-local">local</span>
      <span class="text-env-staging">staging</span>
      <span class="text-env-prod">prod</span>
    </section>

    <section class="flex flex-wrap items-center gap-2">
      <UiTooltip :text="t('design.tooltip')"><UiButton>{{ t('design.hover') }}</UiButton></UiTooltip>
      <UiPopover>
        <template #trigger><UiButton>{{ t('design.popover') }}</UiButton></template>
        {{ t('design.popoverBody') }}
      </UiPopover>
      <UiDropdownMenu :items="menu"><UiButton>{{ t('design.menu') }}</UiButton></UiDropdownMenu>
      <UiContextMenu :items="menu">
        <div class="rounded-md border border-dashed border-border-strong p-2 text-sm text-fg-muted">
          {{ t('design.rightClick') }}
        </div>
      </UiContextMenu>
      <UiButton @click="dialog = true">{{ t('design.dialog') }}</UiButton>
      <UiButton @click="drawer = true">{{ t('design.drawer') }}</UiButton>
      <UiButton @click="toast.push({ kind: 'success', title: t('design.toast') })">
        {{ t('design.toastBtn') }}
      </UiButton>
    </section>

    <UiTabs
      v-model="tab"
      :tabs="[
        { value: 'one', label: t('design.tabOne') },
        { value: 'two', label: t('design.tabTwo') },
      ]"
    >
      <template #one>{{ t('design.tabOne') }}</template>
      <template #two>{{ t('design.tabTwo') }}</template>
    </UiTabs>

    <UiEmptyState icon="lucide:inbox" :title="t('design.emptyTitle')" :description="t('design.emptyDesc')" />

    <UiDialog v-model:open="dialog" :title="t('design.dialog')" :description="t('design.popoverBody')">
      <UiInput v-model="text" />
      <template #footer>
        <UiButton @click="dialog = false">{{ t('common.close') }}</UiButton>
      </template>
    </UiDialog>
    <UiDrawer v-model:open="drawer" :title="t('design.drawer')">{{ t('design.popoverBody') }}</UiDrawer>
  </div>
</template>
