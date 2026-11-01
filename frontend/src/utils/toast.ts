import { reactive } from 'vue'

export interface Toast {
  id: number
  message: string
  kind: 'ok' | 'info' | 'error'
}

let nextId = 1
export const toasts = reactive<Toast[]>([])

export function toast(message: string, kind: Toast['kind'] = 'ok', ms = 3500): void {
  const id = nextId++
  toasts.push({ id, message, kind })
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id)
    if (i >= 0) toasts.splice(i, 1)
  }, ms)
}
