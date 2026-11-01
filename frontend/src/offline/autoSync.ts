import type { SyncEngine } from './syncEngine'

export interface AutoSyncOptions {
  /** Whether there is anything worth syncing (avoids needless requests). */
  hasPending: () => Promise<boolean>
  intervalMs?: number
  focusThrottleMs?: number
}

/**
 * Wire the sync triggers: startup, `online`, regained focus/visibility and a
 * periodic retry while work is pending. `navigator.onLine` is only a hint;
 * the upload attempt itself is what proves the backend is reachable.
 */
export function startAutoSync(engine: SyncEngine, opts: AutoSyncOptions): () => void {
  const intervalMs = opts.intervalMs ?? 30_000
  const focusThrottleMs = opts.focusThrottleMs ?? 2_000
  let lastFocusSync = 0

  const trigger = () => void engine.sync()
  const onOffline = () => engine.markOffline()
  const onFocus = () => {
    if (document.visibilityState === 'hidden') return
    const now = Date.now()
    if (now - lastFocusSync < focusThrottleMs) return
    lastFocusSync = now
    trigger()
  }

  window.addEventListener('online', trigger)
  window.addEventListener('offline', onOffline)
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onFocus)
  const timer = window.setInterval(async () => {
    if (await opts.hasPending()) trigger()
  }, intervalMs)

  trigger() // application startup

  return () => {
    window.removeEventListener('online', trigger)
    window.removeEventListener('offline', onOffline)
    window.removeEventListener('focus', onFocus)
    document.removeEventListener('visibilitychange', onFocus)
    window.clearInterval(timer)
  }
}
