import { describe, expect, it } from 'vitest'
import { coordinatesIn, embedUrl, mapQuery, openUrl } from '@/invite/maps'

describe('maps', () => {
  it("takes the exact spot from a Google Maps link: a place's pin first, then ?q=, then the map centre", () => {
    expect(coordinatesIn('https://www.google.com/maps/place/Sokha+Hotel/@11.5,104.9,17z/data=!3d11.5631!4d104.9282')).toBe('11.5631,104.9282')
    expect(coordinatesIn('https://maps.google.com/?q=11.55,104.92')).toBe('11.55,104.92')
    expect(coordinatesIn('https://www.google.com/maps/@11.5564,104.9282,16z')).toBe('11.5564,104.9282')
    expect(coordinatesIn('https://maps.app.goo.gl/abc123')).toBeNull() // short links hide them
  })

  it('falls back to a search in the link, then the place and address', () => {
    expect(mapQuery('https://www.google.com/maps/search/Sokha+Hotel+Phnom+Penh', '', '')).toBe('Sokha Hotel Phnom Penh')
    expect(mapQuery('https://maps.app.goo.gl/abc123', 'Sokha Hotel', ' Phnom Penh ')).toBe('Sokha Hotel, Phnom Penh')
    expect(mapQuery('', 'សណ្ឋាគារសុខា', '')).toBe('សណ្ឋាគារសុខា')
    expect(mapQuery('', '', '')).toBeNull()
  })

  it('shows the map in a page frame and opens the link (or a search) when tapped', () => {
    expect(embedUrl('11.55,104.92')).toBe('https://maps.google.com/maps?q=11.55%2C104.92&z=15&output=embed')
    expect(openUrl('https://maps.app.goo.gl/abc', 'x')).toBe('https://maps.app.goo.gl/abc')
    expect(openUrl('', 'Sokha Hotel')).toBe('https://www.google.com/maps/search/?api=1&query=Sokha%20Hotel')
  })
})
