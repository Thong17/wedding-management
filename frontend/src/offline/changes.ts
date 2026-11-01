/**
 * Change notifications for locally stored transactions, within this tab and
 * across tabs (BroadcastChannel), so every open view refreshes its counts.
 */
type Listener = () => void

const listeners = new Set<Listener>()
let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === 'undefined') return channel
  channel = new BroadcastChannel('gift-transactions')
  channel.onmessage = () => listeners.forEach((l) => l())
  return channel
}

export function notifyTransactionsChanged(): void {
  listeners.forEach((l) => l())
  try {
    getChannel()?.postMessage('changed')
  } catch {
    /* channel closed */
  }
}

export function onTransactionsChanged(listener: Listener): () => void {
  getChannel()
  listeners.add(listener)
  return () => listeners.delete(listener)
}
