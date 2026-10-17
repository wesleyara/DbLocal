<template>
  <!-- Thin accent bar while a page navigation waits on its data (schema, connection, help article). -->
  <NuxtLoadingIndicator color="var(--accent)" :height="2" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
