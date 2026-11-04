import { shallowRef } from 'vue'

/**
 * In-app replacements for window.confirm / window.alert, shown by AppConfirmHost (mounted once in
 * App.vue) as a Reka UI alert dialog. They return promises:
 *   if (!(await confirmDialog({ message: t('…'), danger: true }))) return
 * Requests made while one is open wait their turn.
 */
export interface ConfirmOptions {
  message: string
  /** Defaults to "Are you sure?" (confirm) or none (alert). */
  title?: string
  /** The confirming button; defaults to "Confirm" / "OK". */
  confirmText?: string
  cancelText?: string
  /** A destructive action (delete, remove, void…): the confirming button is red. */
  danger?: boolean
}

export interface DialogRequest extends ConfirmOptions {
  kind: 'confirm' | 'alert'
  resolve: (ok: boolean) => void
}

/** The request on screen, if any (read by AppConfirmHost). */
export const currentDialog = shallowRef<DialogRequest | null>(null)
const queue: DialogRequest[] = []

function show(kind: DialogRequest['kind'], options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue.push({ ...options, kind, resolve })
    if (!currentDialog.value) currentDialog.value = queue.shift()!
  })
}

/** Ask before doing something. Resolves true when confirmed; Cancel, Escape or closing give false. */
export const confirmDialog = (options: ConfirmOptions) => show('confirm', options)

/** Tell the user something; resolves when they dismiss it. */
export const alertDialog = (options: ConfirmOptions) => show('alert', options).then(() => undefined)

/** Called by the dialog's buttons: settle the request on screen and show the next one. */
export function answerDialog(ok: boolean) {
  const request = currentDialog.value
  if (!request) return
  currentDialog.value = queue.shift() ?? null
  request.resolve(ok)
}
