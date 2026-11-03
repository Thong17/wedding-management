import type { ApiClient } from '@/api/types'
import { t } from '@/i18n'

/** A client's status as one badge: "Trial until …", "Trial ended", "Active" or "Suspended". */
export function clientStatusBadge(c: Pick<ApiClient, 'status' | 'trial_ends_at' | 'lock_reason'>): { label: string; cls: string } {
  if (c.lock_reason === 'suspended') return { label: t('clients.status.suspended'), cls: 'badge-failed' }
  if (c.lock_reason === 'trial_ended') return { label: t('lock.trial_ended'), cls: 'badge-failed' }
  if (c.status === 'trial') {
    return {
      label: c.trial_ends_at ? t('clients.trialUntil', { date: c.trial_ends_at }) : t('clients.status.trial'),
      cls: 'badge-pending',
    }
  }
  return { label: t('clients.status.active'), cls: 'badge-synced' }
}
