<script setup lang="ts">
import { groupByCategory, type HelpArticle, type HelpMeta } from '#shared/help'

const { t, locale } = useI18n()
const route = useRoute()
const { openCentre } = useHelp()

const slug = computed(() => {
  const s = route.params.slug
  return Array.isArray(s) ? s.join('/') : (s ?? '')
})

const { data: list } = await useFetch<HelpMeta[]>('/api/help', {
  key: 'help-list',
  query: { locale },
  watch: [locale],
  default: () => [],
})
const groups = computed(() => groupByCategory(list.value))

const { data: article, error } = await useFetch<HelpArticle>(() => `/api/help/${slug.value || '_'}`, {
  key: () => `help-article-${slug.value}-${locale.value}`,
  query: { locale },
  watch: [slug, locale],
  immediate: slug.value !== '',
})
const notFound = computed(() => slug.value !== '' && !!error.value)
const current = computed(() => (slug.value !== '' && !error.value ? article.value : null))

useHead({ title: () => (current.value ? `${current.value.title} · ${t('help.title')}` : t('help.title')) })

const searchRef = ref<{ clear: () => void } | null>(null)
function open(target: { slug: string; anchor: string | null }) {
  searchRef.value?.clear()
  void openCentre(target.slug ? { slug: target.slug, anchor: target.anchor } : null)
}

// Scroll to the `#anchor` once the article is on screen (and again on in-page hash changes).
function scrollToHash() {
  const id = decodeURIComponent(route.hash.replace(/^#/, ''))
  nextTick(() => (id ? document.getElementById(id)?.scrollIntoView({ block: 'start' }) : undefined))
}
watch(() => [route.hash, current.value?.slug, locale.value] as const, scrollToHash, { flush: 'post' })
onMounted(scrollToHash)

const category = computed(() => current.value?.category)
const firstSlug = computed(() => groups.value[0]?.articles[0]?.slug ?? 'getting-started')
</script>

<template>
  <div class="mx-auto flex w-full max-w-7xl gap-8 px-6 py-6" data-help-page>
    <nav class="hidden w-60 shrink-0 flex-col gap-4 lg:flex" :aria-label="t('help.navLabel')">
      <NuxtLink to="/help" class="text-sm font-semibold text-fg hover:text-accent">{{ t('help.title') }}</NuxtLink>
      <div v-for="g in groups" :key="g.category" class="flex flex-col gap-0.5">
        <span class="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ g.category }}</span>
        <NuxtLink
          v-for="a in g.articles"
          :key="a.slug"
          :to="`/help/${a.slug}`"
          class="rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg"
          active-class="!bg-accent-soft !text-accent"
          :data-help-nav="a.slug"
        >
          {{ a.title }}
        </NuxtLink>
      </div>
    </nav>

    <div class="min-w-0 flex-1">
      <div class="mb-6 max-w-xl"><HelpSearch ref="searchRef" @open="open" /></div>

      <!-- index -->
      <section v-if="slug === ''" class="flex flex-col gap-8" data-help-home>
        <header>
          <h1 class="text-2xl font-semibold tracking-tight">{{ t('help.home.title') }}</h1>
          <p class="mt-1 text-sm text-fg-muted">{{ t('help.home.subtitle') }}</p>
        </header>
        <div v-for="g in groups" :key="g.category" class="flex flex-col gap-3">
          <h2 class="text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ g.category }}</h2>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <NuxtLink
              v-for="a in g.articles"
              :key="a.slug"
              :to="`/help/${a.slug}`"
              class="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
            >
              <span class="text-sm font-medium text-fg">{{ a.title }}</span>
              <span class="text-xs text-fg-muted">{{ a.description }}</span>
            </NuxtLink>
          </div>
        </div>
        <div v-if="groups.length > 0"><UiButton variant="primary" @click="navigateTo(`/help/${firstSlug}`)">{{ t('help.home.start') }}</UiButton></div>
        <HelpTourCard />
      </section>

      <UiEmptyState
        v-else-if="notFound"
        icon="lucide:file-question"
        :title="t('help.notFound.title')"
        :description="t('help.notFound.description')"
      >
        <UiButton @click="navigateTo('/help')">{{ t('help.back') }}</UiButton>
      </UiEmptyState>

      <div v-else-if="current" class="flex gap-10">
        <article class="min-w-0 flex-1" :data-help-slug="current.slug">
          <nav class="mb-3 flex items-center gap-1 text-xs text-fg-subtle" :aria-label="t('help.breadcrumb')">
            <NuxtLink to="/help" class="hover:text-fg">{{ t('help.title') }}</NuxtLink>
            <Icon name="lucide:chevron-right" class="size-3" />
            <span>{{ category }}</span>
          </nav>
          <HelpArticleBody :html="current.html" @navigate="open" />
          <footer v-if="current.relatedArticles.length > 0" class="mt-10 border-t border-border pt-6">
            <h2 class="mb-3 text-sm font-semibold">{{ t('help.related') }}</h2>
            <div class="grid gap-3 sm:grid-cols-2">
              <NuxtLink
                v-for="r in current.relatedArticles"
                :key="r.slug"
                :to="`/help/${r.slug}`"
                class="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
              >
                <span class="text-sm font-medium">{{ r.title }}</span>
                <span class="text-xs text-fg-muted">{{ r.description }}</span>
              </NuxtLink>
            </div>
          </footer>
        </article>
        <aside v-if="current.headings.length > 0" class="sticky top-6 hidden h-fit w-52 shrink-0 xl:block">
          <h2 class="mb-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">{{ t('help.onThisPage') }}</h2>
          <ul class="flex flex-col gap-1 border-l border-border">
            <li v-for="h in current.headings" :key="h.id" :class="h.level > 2 ? 'pl-5' : 'pl-3'">
              <a :href="`#${h.id}`" class="block text-xs text-fg-muted hover:text-fg" @click.prevent="navigateTo({ hash: `#${h.id}` })">
                {{ h.text }}
              </a>
            </li>
          </ul>
        </aside>
      </div>
    </div>
  </div>
</template>
