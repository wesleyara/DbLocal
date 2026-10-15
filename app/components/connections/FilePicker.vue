<script setup lang="ts">
interface Listing {
  path: string
  parent: string | null
  entries: { name: string; type: 'dir' | 'file' }[]
}

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ start?: string }>()
const emit = defineEmits<{ select: [path: string] }>()
const { t } = useI18n()

const listing = ref<Listing | null>(null)
const location = ref('')
const all = ref(false)
const hidden = ref(false)
const loading = ref(false)
const error = ref(false)

async function load(path?: string, retried = false) {
  loading.value = true
  error.value = false
  try {
    listing.value = await $fetch<Listing>('/api/fs/list', {
      query: { path: path || undefined, all: all.value ? '1' : undefined, hidden: hidden.value ? '1' : undefined },
    })
    location.value = listing.value.path
  } catch {
    // A start folder that is not visible to the server (e.g. a host path inside the container):
    // fall back to the server's default folder instead of an empty error.
    if (path && !retried) return load(undefined, true)
    error.value = true
  } finally {
    loading.value = false
  }
}

watch(open, (value) => {
  if (!value) return
  // Start at the folder of the current value, if there is one.
  const from = props.start?.includes('/') ? props.start.replace(/\/[^/]*$/, '') || '/' : undefined
  void load(from)
})
watch([all, hidden], () => void load(location.value))

const join = (name: string) => `${listing.value!.path.replace(/\/$/, '')}/${name}`

function pick(path: string) {
  emit('select', path)
  open.value = false
}
</script>

<template>
  <UiDialog v-model:open="open" :title="t('connections.picker.title')">
    <div class="grid gap-2">
      <div class="flex gap-1">
        <UiIconButton
          icon="lucide:arrow-up"
          :label="t('connections.picker.up')"
          :disabled="!listing?.parent"
          @click="listing?.parent && load(listing.parent)"
        />
        <UiInput v-model="location" mono :aria-label="t('connections.picker.folder')" :invalid="error" @keydown.enter.prevent="load(location)" />
      </div>
      <p v-if="error" class="text-xs text-danger">{{ t('connections.picker.error') }}</p>

      <ul class="h-64 overflow-auto rounded-md border border-border bg-bg-subtle p-1" data-file-list>
        <li v-if="listing && listing.entries.length === 0" class="p-2 text-xs text-fg-subtle">{{ t('connections.picker.empty') }}</li>
        <li v-for="e in listing?.entries ?? []" :key="e.name">
          <button
            type="button"
            class="font-data flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-surface-hover"
            :class="e.type === 'file' ? 'text-fg' : 'text-fg-muted'"
            @click="e.type === 'dir' ? load(join(e.name)) : undefined"
            @dblclick="e.type === 'file' && pick(join(e.name))"
          >
            <Icon :name="e.type === 'dir' ? 'lucide:folder' : 'lucide:database'" class="size-4 shrink-0" />
            <span class="truncate">{{ e.name }}</span>
            <span v-if="e.type === 'file'" class="ml-auto shrink-0 text-xs text-accent" @click.stop="pick(join(e.name))">{{ t('connections.picker.choose') }}</span>
          </button>
        </li>
      </ul>

      <div class="flex gap-4">
        <UiCheckbox v-model="all" :label="t('connections.picker.allFiles')" />
        <UiCheckbox v-model="hidden" :label="t('connections.picker.hidden')" />
      </div>
    </div>
    <template v-if="loading" #footer><UiSpinner class="size-4" /></template>
  </UiDialog>
</template>
