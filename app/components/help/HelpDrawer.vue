<script setup lang="ts">
import type { HelpArticle } from '#shared/help'

/** The help centre inside the workspace: one article in a side drawer, driven by `useHelp()`. */
const { t, locale } = useI18n()
const { drawer, closeDrawer, openCentre } = useHelp()

const article = ref<HelpArticle | null>(null)
const failed = ref(false)
const bodyRef = ref<HTMLElement | null>(null)

const open = computed({
  get: () => drawer.value.open,
  set: (v) => {
    if (!v) closeDrawer()
  },
})

async function load() {
  failed.value = false
  try {
    article.value = await $fetch<HelpArticle>(`/api/help/${drawer.value.slug}`, { query: { locale: locale.value } })
  } catch {
    article.value = null
    failed.value = true
  }
  await nextTick()
  const anchor = drawer.value.anchor
  const target = anchor ? bodyRef.value?.querySelector<HTMLElement>(`[id="${CSS.escape(anchor)}"]`) : null
  if (target) target.scrollIntoView({ block: 'start' })
  else bodyRef.value?.scrollTo({ top: 0 })
}

watch(() => [drawer.value.open, drawer.value.slug, drawer.value.anchor, locale.value] as const, () => {
  if (drawer.value.open) void load()
})

function navigate(target: { slug: string; anchor: string | null }) {
  drawer.value = { open: true, slug: target.slug || drawer.value.slug, anchor: target.anchor }
}
</script>

<template>
  <!-- Elevated: a hint inside a dialog or drawer opens the article above it. -->
  <UiDrawer v-model:open="open" :title="article?.title ?? t('help.title')" :description="article?.description" wide elevated>
    <div ref="bodyRef" class="h-full overflow-auto" data-help-drawer>
      <HelpArticleBody v-if="article" :html="article.html" @navigate="navigate" />
      <p v-else-if="failed" class="text-sm text-fg-muted">{{ t('help.notFound.description') }}</p>
    </div>
    <template #footer>
      <UiButton size="sm" variant="secondary" @click="openCentre({ slug: drawer.slug, anchor: drawer.anchor })">
        <Icon name="lucide:external-link" class="size-3.5" />{{ t('help.openInCentre') }}
      </UiButton>
    </template>
  </UiDrawer>
</template>
