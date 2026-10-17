<script setup lang="ts">
import { PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot } from 'reka-ui'
import { useTourStore } from '~/stores/tour'

/**
 * Spotlight + popover of the guided tour. It looks the target up by `data-tour`, keeps measuring it
 * (pages load their data after the route changes), and falls back to a centred card when the
 * element is not there, so a step can never block the tour. Keys: → next, ← back, Esc stop.
 * After a step change the target usually appears a moment later (the step navigated and the page
 * is still loading), so the card waits `TARGET_GRACE` with only the backdrop before falling back to
 * the centre; otherwise it would flash in the middle and then jump to the element.
 */
const { t } = useI18n()
const tour = useTourStore()

const el = ref<HTMLElement | null>(null)
const rect = ref<{ top: number; left: number; width: number; height: number } | null>(null)
let timer: ReturnType<typeof setInterval> | undefined
let graceTimer: ReturnType<typeof setTimeout> | undefined
const PAD = 6
const TARGET_GRACE = 2000
/** The step has a target that has not shown up yet, and the grace period is not over. */
const waiting = ref(false)

function measure() {
  const target = tour.step.target
  if (!target) return
  let found = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
  // Rendered but not laid out yet (hidden while its page loads): anchoring to it would put the card in a corner.
  if (found) {
    const box = found.getBoundingClientRect()
    if (box.width === 0 && box.height === 0) found = null
  }
  if (found) waiting.value = false
  if (found !== el.value) {
    el.value = found
    if (found) found.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  if (!found) {
    rect.value = null
    return
  }
  const r = found.getBoundingClientRect()
  const next = { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
  const prev = rect.value
  if (!prev || prev.top !== next.top || prev.left !== next.left || prev.width !== next.width || prev.height !== next.height) rect.value = next
}

function watchTarget() {
  clearInterval(timer)
  clearTimeout(graceTimer)
  el.value = null
  rect.value = null
  waiting.value = !!tour.step.target
  graceTimer = setTimeout(() => (waiting.value = false), TARGET_GRACE)
  measure()
  // Keeps polling for as long as the step is shown: on a slow machine the page's data can arrive
  // after any fixed deadline, and the centred card is shown meanwhile.
  timer = setInterval(measure, 200)
}

function onKey(event: KeyboardEvent) {
  if (!tour.active) return
  if (event.key === 'Escape') {
    event.preventDefault()
    tour.skip()
  } else if (event.key === 'ArrowRight') {
    event.preventDefault()
    void tour.next()
  } else if (event.key === 'ArrowLeft' && tour.index > 0) {
    event.preventDefault()
    void tour.back()
  }
}

function stopWatching() {
  clearInterval(timer)
  clearTimeout(graceTimer)
  waiting.value = false
}

watch(() => [tour.active, tour.index] as const, ([active]) => (active ? watchTarget() : stopWatching()), { immediate: true })
onMounted(() => window.addEventListener('keydown', onKey, true))
onBeforeUnmount(() => {
  stopWatching()
  window.removeEventListener('keydown', onKey, true)
})

const anchored = computed(() => !!rect.value && !!el.value)
const spotlight = computed(() =>
  rect.value ? { top: `${rect.value.top}px`, left: `${rect.value.left}px`, width: `${rect.value.width}px`, height: `${rect.value.height}px` } : null,
)
</script>

<template>
  <Teleport to="body">
    <div v-if="tour.active" class="pointer-events-none fixed inset-0 z-[70]" data-tour-overlay>
      <div
        v-if="spotlight"
        class="absolute rounded-lg ring-2 ring-accent transition-all duration-200"
        :style="{ ...spotlight, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)' }"
        data-tour-spotlight
      />
      <div v-else class="absolute inset-0 bg-black/50" />

      <!-- anchored to the element -->
      <PopoverRoot v-if="anchored" :open="true">
        <PopoverAnchor :reference="el!" />
        <PopoverPortal>
          <PopoverContent
            :side="tour.step.placement"
            :side-offset="14"
            :collision-padding="12"
            class="pointer-events-auto z-[80] w-80 rounded-lg border border-border bg-surface p-4 shadow-pop"
            role="dialog"
            :aria-label="t(`tour.steps.${tour.step.id}.title`)"
            @open-auto-focus.prevent
            @interact-outside.prevent
            @escape-key-down.prevent
          >
            <HelpTourStepBody />
          </PopoverContent>
        </PopoverPortal>
      </PopoverRoot>

      <!-- the element is not on screen (and the grace period is over): a centred card -->
      <div v-else-if="!waiting" class="absolute inset-0 flex items-center justify-center p-4">
        <div
          class="pointer-events-auto w-80 rounded-lg border border-border bg-surface p-4 shadow-pop"
          role="dialog"
          :aria-label="t(`tour.steps.${tour.step.id}.title`)"
        >
          <HelpTourStepBody />
        </div>
      </div>
    </div>
  </Teleport>
</template>
