import QRCode from 'qrcode'
import type { ApiEvent, ApiGuest } from '@/api/types'
import { qrPayloadForGuest } from '@/offline/guestSearch'
import { downloadFile, SIDE_LABELS } from '@/utils/format'

const QR_PX = 110
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** One row per guest with every field plus a scannable QR image (same payload as the printed QR sheet). */
export async function exportGuestsXlsx(event: Pick<ApiEvent, 'id' | 'name'>, guests: ApiGuest[]): Promise<void> {
  // exceljs is large, so it is only loaded when someone actually exports.
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Guests', { views: [{ state: 'frozen', ySplit: 1 }] })

  sheet.columns = [
    { header: 'QR', key: 'qr', width: 17 },
    { header: 'Full name', key: 'full_name', width: 28 },
    { header: 'Nickname', key: 'nickname', width: 16 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Side', key: 'side', width: 10 },
    { header: 'Group', key: 'group', width: 18 },
    { header: 'Table', key: 'table_no', width: 8 },
    { header: 'QR code text', key: 'qr_text', width: 46 },
    { header: 'Guest ID', key: 'id', width: 10 },
  ]
  sheet.getRow(1).font = { bold: true }

  const active = guests.filter((g) => !g.is_deleted)
  for (const [i, g] of active.entries()) {
    const payload = qrPayloadForGuest(g)
    const row = sheet.addRow({
      full_name: g.full_name,
      nickname: g.nickname,
      phone: g.phone,
      side: SIDE_LABELS[g.side] ?? g.side,
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
