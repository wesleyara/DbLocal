<script setup lang="ts">
import { parseConnectionString } from '#shared/connection-string'
import type {
  ConnectionColor,
  ConnectionView,
  Dialect,
  Environment,
  SshAuthMethod,
  SslMode,
} from '#shared/types/connection'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ connection: ConnectionView | null }>()
const emit = defineEmits<{ saved: [view: ConnectionView] }>()

const { t } = useI18n()
const { message } = useConnectionErrors()

/** Form state. Ports are strings while typing; secrets are blank unless the user types them. */
interface FormState {
  name: string
  dialect: Dialect
  connectionString: string
  host: string
  port: string
  user: string
  password: string
  database: string
  filePath: string
  environment: Environment
  color: ConnectionColor
  readonly: boolean
  sslMode: SslMode
  sslCa: string
  sslCert: string
  sslKey: string
  sshEnabled: boolean
  sshHost: string
  sshPort: string
  sshUser: string
  sshAuth: SshAuthMethod
  sshPassword: string
  sshPrivateKey: string
  sshPassphrase: string
}

const emptyForm = (): FormState => ({
  name: '',
  dialect: 'postgres',
  connectionString: '',
  host: '127.0.0.1',
  port: '5432',
  user: '',
  password: '',
  database: '',
  filePath: '',
  environment: 'local',
  color: 'neutral',
  readonly: false,
  sslMode: 'disable',
  sslCa: '',
  sslCert: '',
  sslKey: '',
  sshEnabled: false,
  sshHost: '',
  sshPort: '22',
  sshUser: '',
  sshAuth: 'password',
  sshPassword: '',
  sshPrivateKey: '',
  sshPassphrase: '',
})

const form = reactive<FormState>(emptyForm())
const tab = ref('general')
const connectionStringError = ref(false)
const testResult = ref<{ ok: boolean; text: string } | null>(null)
const testing = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)

const isEdit = computed(() => props.connection !== null)
const isSqlite = computed(() => form.dialect === 'sqlite')

const dialectOptions = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite' },
]
const environmentOptions = computed(() =>
  (['local', 'staging', 'prod'] as const).map((value) => ({ value, label: t(`env.${value}`) })),
)
const colorOptions = computed(() =>
  (['accent', 'success', 'warning', 'danger', 'neutral'] as const).map((value) => ({
    value,
    label: t(`connections.colors.${value}`),
  })),
)
const sslOptions = computed(() => [
  { value: 'disable', label: t('connections.ssl.disable') },
  { value: 'require', label: t('connections.ssl.require') },
  { value: 'verify-ca', label: t('connections.ssl.verifyCa') },
  { value: 'verify-full', label: t('connections.ssl.verifyFull') },
])
const sshAuthOptions = computed(() => [
  { value: 'password', label: t('connections.ssh.authPassword') },
  { value: 'key', label: t('connections.ssh.authKey') },
])
const tabs = computed(() => [
  { value: 'general', label: t('connections.tabs.general') },
  { value: 'ssl', label: t('connections.tabs.ssl') },
  { value: 'ssh', label: t('connections.tabs.ssh') },
  { value: 'advanced', label: t('connections.tabs.advanced') },
])

const DEFAULT_PORT: Record<Dialect, string> = { postgres: '5432', mysql: '3306', sqlite: '' }

// Changing the dialect moves the default port along, unless the user typed a custom one.
watch(
  () => form.dialect,
  (next, prev) => {
    if (form.port === DEFAULT_PORT[prev] || form.port === '') form.port = DEFAULT_PORT[next]
    if (next === 'sqlite' && tab.value !== 'general' && tab.value !== 'advanced') tab.value = 'general'
  },
)

watch(
  open,
  (value) => {
    if (!value) return
    Object.assign(form, emptyForm(), toForm(props.connection))
    tab.value = 'general'
    testResult.value = null
    saveError.value = null
    connectionStringError.value = false
  },
  { immediate: true },
)

/** Values a stored connection shows in the form. Secrets are never loaded: they stay blank. */
function toForm(c: ConnectionView | null): Partial<FormState> {
  if (!c) return {}
  return {
    name: c.name,
    dialect: c.dialect,
    host: c.host ?? '',
    port: c.port ? String(c.port) : DEFAULT_PORT[c.dialect],
    user: c.user ?? '',
    database: c.database ?? '',
    filePath: c.filePath ?? '',
    environment: c.environment,
    color: c.color ?? 'neutral',
    readonly: c.readonly,
    sslMode: c.ssl.mode,
    sshEnabled: c.ssh.enabled,
    sshHost: c.ssh.host ?? '',
    sshPort: c.ssh.port ? String(c.ssh.port) : '22',
    sshUser: c.ssh.user ?? '',
    sshAuth: c.ssh.authMethod,
  }
}

/** Fills the fields from a pasted URL. Only fields the string actually has are overwritten. */
function applyConnectionString() {
  connectionStringError.value = false
  if (!form.connectionString.trim()) return
  try {
    const parsed = parseConnectionString(form.dialect, form.connectionString)
    if (parsed.host) form.host = parsed.host
    if (parsed.port) form.port = String(parsed.port)
    if (parsed.user) form.user = parsed.user
    if (parsed.password) form.password = parsed.password
    if (parsed.database) form.database = parsed.database
    if (parsed.filePath) form.filePath = parsed.filePath
    if (parsed.sslMode) form.sslMode = parsed.sslMode
  } catch {
    connectionStringError.value = true
  }
}

const blankToUndefined = (v: string) => (v.trim() === '' ? undefined : v)

/**
 * Body for the test and the save. Secrets that are blank are `undefined`, so an edit keeps the
 * stored value (the server applies the same rule as PATCH).
 */
function buildBody(forTest: boolean) {
  const sqlite = isSqlite.value
  const port = form.port.trim() === '' ? undefined : Number(form.port)
  const ssl = sqlite
    ? { mode: 'disable' as const }
    : {
        mode: form.sslMode,
        ca: blankToUndefined(form.sslCa),
        cert: blankToUndefined(form.sslCert),
        key: blankToUndefined(form.sslKey),
      }
  const ssh =
    !sqlite && form.sshEnabled
      ? {
          enabled: true,
          host: blankToUndefined(form.sshHost),
          port: form.sshPort.trim() === '' ? undefined : Number(form.sshPort),
          user: blankToUndefined(form.sshUser),
          authMethod: form.sshAuth,
          password: blankToUndefined(form.sshPassword),
          privateKey: blankToUndefined(form.sshPrivateKey),
          passphrase: blankToUndefined(form.sshPassphrase),
        }
      : !sqlite
        ? { enabled: false, authMethod: form.sshAuth }
        : undefined

  const common = {
    dialect: form.dialect,
    host: sqlite ? undefined : blankToUndefined(form.host),
    port: sqlite ? undefined : port,
    user: sqlite ? undefined : blankToUndefined(form.user),
    password: sqlite ? undefined : blankToUndefined(form.password),
    database: sqlite ? undefined : blankToUndefined(form.database),
    filePath: sqlite ? blankToUndefined(form.filePath) : undefined,
    ssl,
    ssh,
  }
  if (forTest) {
    return { ...common, connectionId: props.connection?.id }
  }
  return {
    ...common,
    name: form.name.trim(),
    environment: form.environment,
    color: form.color,
    readonly: form.readonly,
  }
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await $fetch<{ serverVersion: string; latencyMs: number }>('/api/connections/test', {
      method: 'POST',
      body: buildBody(true),
    })
    testResult.value = {
      ok: true,
      text: t('connections.test.ok', { version: res.serverVersion, latency: res.latencyMs }),
    }
  } catch (err) {
    testResult.value = { ok: false, text: message(err) }
  } finally {
    testing.value = false
  }
}

async function save() {
  saving.value = true
  saveError.value = null
  try {
    const body = buildBody(false)
    const view = props.connection
      ? await $fetch<ConnectionView>(`/api/connections/${props.connection.id}`, { method: 'PATCH', body })
      : await $fetch<ConnectionView>('/api/connections', { method: 'POST', body })
    emit('saved', view)
    open.value = false
  } catch (err) {
    saveError.value = message(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UiDrawer
    v-model:open="open"
    :title="isEdit ? t('connections.form.editTitle') : t('connections.form.createTitle')"
    :description="isEdit ? t('connections.form.editDescription') : t('connections.form.createDescription')"
  >
    <form class="flex flex-col gap-4" @submit.prevent="save">
      <UiTabs v-model="tab" :tabs="tabs">
        <template #general>
          <div class="grid gap-3">
            <label class="grid gap-1 text-xs text-fg-muted">
              {{ t('connections.fields.name') }}
              <UiInput v-model="form.name" required />
            </label>

            <label class="grid gap-1 text-xs text-fg-muted">
              {{ t('connections.fields.dialect') }}
              <UiSelect v-model="form.dialect" :options="dialectOptions" :disabled="isEdit" />
            </label>

            <template v-if="!isSqlite">
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.fields.connectionString') }}
                <UiInput
                  v-model="form.connectionString"
                  mono
                  :invalid="connectionStringError"
                  :placeholder="form.dialect === 'mysql' ? 'mysql://user:pass@host/db' : 'postgres://user:pass@host/db'"
                  @blur="applyConnectionString"
                  @keydown.enter.prevent="applyConnectionString"
                />
                <span v-if="connectionStringError" class="text-danger">
                  {{ t('connections.fields.connectionStringInvalid') }}
                </span>
                <span v-else class="text-fg-subtle">{{ t('connections.fields.connectionStringHint') }}</span>
              </label>

              <div class="grid grid-cols-[1fr_6rem] gap-2">
                <label class="grid gap-1 text-xs text-fg-muted">
                  {{ t('connections.fields.host') }}
                  <UiInput v-model="form.host" mono />
                </label>
                <label class="grid gap-1 text-xs text-fg-muted">
                  {{ t('connections.fields.port') }}
                  <UiInput v-model="form.port" mono inputmode="numeric" />
                </label>
              </div>

              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.fields.user') }}
                <UiInput v-model="form.user" mono autocomplete="off" />
              </label>

              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.fields.password') }}
                <UiInput
                  v-model="form.password"
                  type="password"
                  mono
                  autocomplete="new-password"
                  :placeholder="connection?.hasPassword ? t('connections.fields.passwordStored') : ''"
                />
              </label>

              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.fields.database') }}
                <UiInput v-model="form.database" mono />
              </label>
            </template>

            <label v-else class="grid gap-1 text-xs text-fg-muted">
              {{ t('connections.fields.filePath') }}
              <UiInput v-model="form.filePath" mono placeholder="/path/to/app.db" />
            </label>

          </div>
        </template>

        <template #ssl>
          <div class="grid gap-3">
            <label class="grid gap-1 text-xs text-fg-muted">
              {{ t('connections.ssl.mode') }}
              <UiSelect v-model="form.sslMode" :options="sslOptions" />
            </label>
            <template v-if="form.sslMode !== 'disable'">
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.ssl.ca') }}
                <UiTextarea v-model="form.sslCa" mono rows="3" :placeholder="connection?.ssl.hasCa ? t('connections.ssl.stored') : ''" />
              </label>
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.ssl.cert') }}
                <UiTextarea v-model="form.sslCert" mono rows="3" :placeholder="connection?.ssl.hasCert ? t('connections.ssl.stored') : ''" />
              </label>
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.ssl.key') }}
                <UiTextarea v-model="form.sslKey" mono rows="3" :placeholder="connection?.ssl.hasKey ? t('connections.ssl.stored') : ''" />
              </label>
            </template>
          </div>
        </template>

        <template #ssh>
          <div class="grid gap-3">
            <UiSwitch v-model="form.sshEnabled" :label="t('connections.ssh.enabled')" />
            <template v-if="form.sshEnabled">
              <div class="grid grid-cols-[1fr_6rem] gap-2">
                <label class="grid gap-1 text-xs text-fg-muted">
                  {{ t('connections.ssh.host') }}
                  <UiInput v-model="form.sshHost" mono />
                </label>
                <label class="grid gap-1 text-xs text-fg-muted">
                  {{ t('connections.ssh.port') }}
                  <UiInput v-model="form.sshPort" mono inputmode="numeric" />
                </label>
              </div>
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.ssh.user') }}
                <UiInput v-model="form.sshUser" mono autocomplete="off" />
              </label>
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.ssh.authMethod') }}
                <UiSelect v-model="form.sshAuth" :options="sshAuthOptions" />
              </label>
              <label v-if="form.sshAuth === 'password'" class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.ssh.password') }}
                <UiInput
                  v-model="form.sshPassword"
                  type="password"
                  mono
                  autocomplete="new-password"
                  :placeholder="connection?.ssh.hasPassword ? t('connections.ssh.stored') : ''"
                />
              </label>
              <template v-else>
                <label class="grid gap-1 text-xs text-fg-muted">
                  {{ t('connections.ssh.privateKey') }}
                  <UiTextarea v-model="form.sshPrivateKey" mono rows="4" :placeholder="connection?.ssh.hasPrivateKey ? t('connections.ssh.stored') : ''" />
                </label>
                <label class="grid gap-1 text-xs text-fg-muted">
                  {{ t('connections.ssh.passphrase') }}
                  <UiInput
                    v-model="form.sshPassphrase"
                    type="password"
                    mono
                    autocomplete="new-password"
                    :placeholder="connection?.ssh.hasPassphrase ? t('connections.ssh.stored') : ''"
                  />
                </label>
              </template>
            </template>
          </div>
        </template>

        <template #advanced>
          <div class="grid gap-3">
            <div class="grid grid-cols-2 gap-2">
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.fields.environment') }}
                <UiSelect v-model="form.environment" :options="environmentOptions" />
              </label>
              <label class="grid gap-1 text-xs text-fg-muted">
                {{ t('connections.fields.color') }}
                <UiSelect v-model="form.color" :options="colorOptions" />
              </label>
            </div>

            <UiCheckbox v-model="form.readonly" :label="t('connections.fields.readonly')" />
            <p class="-mt-2 text-xs text-fg-subtle">{{ t('connections.fields.readonlyHint') }}</p>

            <p v-if="connection" class="text-xs text-fg-muted">
              {{ t('connections.fields.defaultSchema') }}:
              <span class="font-data text-fg">{{ connection.defaultSchema ?? '—' }}</span>
            </p>
          </div>
        </template>
      </UiTabs>

      <div class="flex flex-col gap-2 border-t border-border pt-3">
        <p v-if="testResult" class="text-sm" :class="testResult.ok ? 'text-success' : 'text-danger'" role="status">
          {{ testResult.text }}
        </p>
        <p v-if="saveError" class="text-sm text-danger" role="alert">{{ saveError }}</p>
        <div class="flex items-center justify-end gap-2">
          <UiButton variant="secondary" :loading="testing" :disabled="saving" @click="testConnection">
            {{ t('connections.test.button') }}
          </UiButton>
          <UiButton variant="ghost" :disabled="saving" @click="open = false">{{ t('common.cancel') }}</UiButton>
          <UiButton type="submit" variant="primary" :loading="saving" :disabled="testing">
            {{ t('common.save') }}
          </UiButton>
        </div>
      </div>
    </form>
  </UiDrawer>
</template>
