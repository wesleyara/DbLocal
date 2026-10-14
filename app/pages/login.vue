<script setup lang="ts">
definePageMeta({ layout: false })
const { t } = useI18n()
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: { password: password.value } })
    await navigateTo('/', { external: true })
  } catch (e: unknown) {
    const status = (e as { statusCode?: number }).statusCode
    error.value = status === 429 ? t('login.tooMany') : t('login.invalid')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-bg p-4">
    <form
      class="w-full max-w-xs space-y-3 rounded-lg border border-border bg-surface p-4"
      @submit.prevent="submit"
    >
      <h1 class="text-xl font-semibold text-fg">{{ t('app.name') }}</h1>
      <UiInput
        v-model="password"
        type="password"
        autocomplete="current-password"
        :placeholder="t('login.password')"
        :aria-label="t('login.password')"
        :invalid="!!error"
      />
      <p v-if="error" class="text-xs text-danger" role="alert">{{ error }}</p>
      <UiButton type="submit" variant="primary" class="w-full" :loading="loading">
        {{ t('login.submit') }}
      </UiButton>
    </form>
  </div>
</template>
