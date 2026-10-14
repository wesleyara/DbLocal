<script setup lang="ts">
import type { Cardinality, VirtualRelationDef } from '#shared/types/db'
import type { VirtualRelationInput } from '#shared/schemas/virtual-relation'
import { useSchemaStore } from '~/stores/schema'

const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const { message } = useConnectionErrors()
const toast = useToast()
const store = useSchemaStore()

/** Shape of the API issues (`data.issues`). The message is built here, from the code. */
interface Issue {
  code: string
  params: Record<string, string>
}

const EMPTY = { name: '', fromTable: '', fromColumn: '', toTable: '', toColumn: '', cardinality: 'many-to-one' as Cardinality }
const editingId = ref<string | null>(null)
const form = reactive({ ...EMPTY })
const formError = ref<string | null>(null)
const issues = ref<Issue[]>([])
const formOpen = ref(false)

const cardinalities: { value: Cardinality; label: string }[] = [
  { value: 'many-to-one', label: t('virtualRelations.cardinalityOptions.manyToOne') },
  { value: 'one-to-many', label: t('virtualRelations.cardinalityOptions.oneToMany') },
  { value: 'one-to-one', label: t('virtualRelations.cardinalityOptions.oneToOne') },
  { value: 'many-to-many', label: t('virtualRelations.cardinalityOptions.manyToMany') },
]

const tableOptions = computed(() => store.tables.map((tb) => ({ value: tb.name, label: tb.name })))
function columnOptions(table: string) {
  return (store.tables.find((tb) => tb.name === table)?.columns ?? []).map((c) => ({ value: c.name, label: c.name }))
}

/** Translates an issue code (`column-not-found`) into its message key (`issue.columnNotFound`). */
function issueText(issue: Issue): string {
  const key = issue.code.replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
  return t(`virtualRelations.issue.${key}`, issue.params)
}

/** Reads the issues the API attached to a 400 or 409 response. */
function issuesOf(err: unknown): Issue[] {
  return (err as { data?: { data?: { issues?: Issue[] } } })?.data?.data?.issues ?? []
}

function label(rel: VirtualRelationDef): string {
  const from = `${rel.fromTable}.${rel.fromColumns.join(', ')}`
  const to = `${rel.toTable}.${rel.toColumns.join(', ')}`
  return rel.name ?? `${from} → ${to}`
}

function cardinalityOf(rel: VirtualRelationDef): string {
  return cardinalities.find((c) => c.value === rel.cardinality)?.label ?? rel.cardinality
}

function startNew() {
  editingId.value = null
  Object.assign(form, EMPTY)
  issues.value = []
  formError.value = null
  formOpen.value = true
}

function startEdit(rel: VirtualRelationDef) {
  editingId.value = rel.id
  Object.assign(form, {
    name: rel.name ?? '',
    fromTable: rel.fromTable,
    fromColumn: rel.fromColumns[0] ?? '',
    toTable: rel.toTable,
    toColumn: rel.toColumns[0] ?? '',
    cardinality: rel.cardinality,
  })
  issues.value = []
  formError.value = null
  formOpen.value = true
}

async function save() {
  formError.value = null
  issues.value = []
  if (!form.fromTable || !form.fromColumn || !form.toTable || !form.toColumn) {
    formError.value = t('virtualRelations.pickColumns')
    return
  }
  const input: VirtualRelationInput = {
    schema: store.schema ?? '',
    name: form.name.trim() || null,
    fromTable: form.fromTable,
    fromColumns: [form.fromColumn],
    toTable: form.toTable,
    toColumns: [form.toColumn],
    cardinality: form.cardinality,
  }
  try {
    if (editingId.value) await store.updateVirtual(editingId.value, input)
    else await store.addVirtual(input)
    toast.push({ kind: 'success', title: t('virtualRelations.saved') })
    formOpen.value = false
  } catch (err) {
    issues.value = issuesOf(err)
    if (issues.value.length === 0) formError.value = message(err)
  }
}

async function remove(rel: VirtualRelationDef) {
  try {
    await store.removeVirtual(rel.id)
    toast.push({ kind: 'success', title: t('virtualRelations.removed') })
  } catch (err) {
    toast.push({ kind: 'error', title: message(err) })
  }
}
</script>

<template>
  <UiDialog v-model:open="open" :title="t('virtualRelations.title')" :description="t('virtualRelations.description')">
    <div class="grid gap-3">
      <p v-if="store.virtual.length === 0 && !formOpen" class="text-sm text-fg-muted">{{ t('virtualRelations.empty') }}</p>

      <ul v-if="!formOpen" class="grid gap-1">
        <li
          v-for="rel in store.virtual"
          :key="rel.id"
          class="flex items-center gap-2 rounded-md border border-dashed border-accent/50 px-2 py-1.5 text-sm"
        >
          <Icon name="lucide:link-2" class="size-3.5 shrink-0 text-accent" />
          <span class="font-data min-w-0 flex-1 truncate text-fg">{{ label(rel) }}</span>
          <span class="shrink-0 text-xs text-fg-subtle">{{ cardinalityOf(rel) }}</span>
          <UiIconButton icon="lucide:pencil" :label="t('virtualRelations.edit')" size="sm" @click="startEdit(rel)" />
          <UiIconButton icon="lucide:trash-2" :label="t('virtualRelations.remove')" size="sm" @click="remove(rel)" />
        </li>
      </ul>

      <div v-if="!formOpen">
        <UiButton variant="secondary" size="sm" @click="startNew">
          <Icon name="lucide:plus" class="size-3.5" />
          {{ t('virtualRelations.add') }}
        </UiButton>
      </div>

      <form v-else class="grid gap-3" @submit.prevent="save">
        <label class="grid gap-1 text-xs text-fg-muted">
          {{ t('virtualRelations.name') }}
          <UiInput v-model="form.name" maxlength="120" />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="grid gap-1 text-xs text-fg-muted">
            {{ t('virtualRelations.fromTable') }}
            <UiSelect :model-value="form.fromTable" :options="tableOptions" @update:model-value="(v) => { form.fromTable = v ?? ''; form.fromColumn = '' }" />
          </label>
          <label class="grid gap-1 text-xs text-fg-muted">
            {{ t('virtualRelations.fromColumn') }}
            <UiSelect :model-value="form.fromColumn" :options="columnOptions(form.fromTable)" :disabled="!form.fromTable" @update:model-value="(v) => (form.fromColumn = v ?? '')" />
          </label>
          <label class="grid gap-1 text-xs text-fg-muted">
            {{ t('virtualRelations.toTable') }}
            <UiSelect :model-value="form.toTable" :options="tableOptions" @update:model-value="(v) => { form.toTable = v ?? ''; form.toColumn = '' }" />
          </label>
          <label class="grid gap-1 text-xs text-fg-muted">
            {{ t('virtualRelations.toColumn') }}
            <UiSelect :model-value="form.toColumn" :options="columnOptions(form.toTable)" :disabled="!form.toTable" @update:model-value="(v) => (form.toColumn = v ?? '')" />
          </label>
        </div>

        <label class="grid gap-1 text-xs text-fg-muted">
          {{ t('virtualRelations.cardinality') }}
          <UiSelect :model-value="form.cardinality" :options="cardinalities" @update:model-value="(v) => v && (form.cardinality = v as Cardinality)" />
        </label>

        <div v-if="formError || issues.length" class="grid gap-1" role="alert">
          <p v-if="formError" class="text-xs text-danger">{{ formError }}</p>
          <p v-for="(issue, i) in issues" :key="i" class="text-xs text-danger">{{ issueText(issue) }}</p>
        </div>

        <div class="flex justify-end gap-2">
          <UiButton variant="secondary" @click="formOpen = false">{{ t('common.cancel') }}</UiButton>
          <UiButton type="submit" variant="primary">{{ t('virtualRelations.save') }}</UiButton>
        </div>
      </form>
    </div>
  </UiDialog>
</template>
