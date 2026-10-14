export interface ToastItem {
  id: number
  kind: 'info' | 'success' | 'warning' | 'error'
  title: string
  description?: string
  duration: number
}

const toasts = ref<ToastItem[]>([])
let seq = 0

export function useToast() {
  function push(t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) {
    toasts.value.push({ id: ++seq, duration: 4000, ...t })
  }
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }
  return { toasts, push, dismiss }
}
