<script setup lang="ts">
const { t } = useI18n()
</script>

<template>
  <UiEmptyState
    icon="lucide:table-2"
    :title="t('shell.noTable')"
    :description="t('shell.noTableHint')"
  />
</template>
