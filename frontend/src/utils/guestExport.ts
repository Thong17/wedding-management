import QRCode from 'qrcode'
import type { ApiEvent, ApiGuest } from '@/api/types'
import { qrPayloadForGuest } from '@/offline/guestSearch'
import { t } from '@/i18n'
import { downloadFile, sideLabel } from '@/utils/format'

const QR_PX = 110
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Columns the guest CSV import reads (CSV_FIELDS in backend/events/views.py). Names stay English in every language. */
export const GUEST_CSV_COLUMNS = ['full_name', 'nickname', 'phone', 'side', 'group', 'table_no'] as const

/**
 * Empty import template: just the header row, so no sample row can be imported as a real guest.
 * The BOM makes Excel open it as UTF-8, keeping Khmer names intact; the import accepts it.
 */
export function downloadGuestCsvTemplate(): void {
  downloadFile('guests-template.csv', '﻿' + GUEST_CSV_COLUMNS.join(',') + '\r\n', 'text/csv')
}

/** One row per guest with every field plus a scannable QR image (same payload as the printed QR sheet). */
export async function exportGuestsXlsx(event: Pick<ApiEvent, 'id' | 'name' | 'invite_qr'>, guests: ApiGuest[]): Promise<void> {
  // exceljs is large, so it is only loaded when someone actually exports.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  // Headers and side labels follow the current UI language.
  const sheet = workbook.addWorksheet(t('export.sheet'), { views: [{ state: 'frozen', ySplit: 1 }] })

  sheet.columns = [
    { header: t('export.qr'), key: 'qr', width: 17 },
    { header: t('export.fullName'), key: 'full_name', width: 28 },
    { header: t('export.nickname'), key: 'nickname', width: 16 },
    { header: t('export.phone'), key: 'phone', width: 16 },
    { header: t('export.side'), key: 'side', width: 14 },
    { header: t('export.group'), key: 'group', width: 18 },
    { header: t('export.table'), key: 'table_no', width: 8 },
    { header: t('export.qrText'), key: 'qr_text', width: 46 },
    { header: t('export.guestId'), key: 'id', width: 12 },
  ]
  sheet.getRow(1).font = { bold: true }

  const active = guests.filter((g) => !g.is_deleted)
  for (const [i, g] of active.entries()) {
    const payload = qrPayloadForGuest(g, event.invite_qr)
    const row = sheet.addRow({
      full_name: g.full_name,
      nickname: g.nickname,
      phone: g.phone,
      side: sideLabel(g.side),
      group: g.group,
      table_no: g.table_no,
      qr_text: payload,
      id: g.id,
    })
    row.height = QR_PX * 0.75 + 8 // row height is in points
    row.alignment = { vertical: 'middle', wrapText: true }

    const base64 = await QRCode.toDataURL(payload, { margin: 1, width: QR_PX * 2, errorCorrectionLevel: 'M' })
    const imageId = workbook.addImage({ base64, extension: 'png' })
    // Rows and columns are zero-based here; row i + 1 skips the header.
    sheet.addImage(imageId, { tl: { col: 0.1, row: i + 1.05 }, ext: { width: QR_PX, height: QR_PX } })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const slug = event.name.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `event-${event.id}`
  downloadFile(`guests-${slug}.xlsx`, buffer, XLSX_TYPE)
}
