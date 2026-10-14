<script setup lang="ts">
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'

const model = defineModel<string>()
defineProps<{ tabs: { value: string; label: string }[] }>()
</script>

<template>
  <TabsRoot v-model="model">
    <TabsList class="flex gap-1 border-b border-border">
      <TabsTrigger
        v-for="t in tabs"
        :key="t.value"
        :value="t.value"
        class="-mb-px h-8 border-b-2 border-transparent px-3 text-sm text-fg-muted hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg"
      >
        {{ t.label }}
      </TabsTrigger>
    </TabsList>
    <TabsContent v-for="t in tabs" :key="t.value" :value="t.value" class="pt-3">
      <slot :name="t.value" />
    </TabsContent>
  </TabsRoot>
</template>
