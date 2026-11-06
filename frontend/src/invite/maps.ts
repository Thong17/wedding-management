/**
 * Showing a programme place on a map. Google Maps can show any place in a page frame without an API
 * key (`output=embed`), from coordinates or from a search.
 *
 * The exact spot comes from the organizer's Google Maps link when it carries coordinates (links copied
 * from a place's page do). Short share links (maps.app.goo.gl/…) hide them, so the map then searches
 * for the place's name and address instead.
 */

const COORDS = [
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/, // a place's own pin (in /maps/place/… links)
  /[?&](?:q|ll|query|destination|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/, // ?q=11.55,104.92
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/, // the map's centre (…/@11.55,104.92,17z)
]

/** "lat,lng" from a Google Maps link, or null. */
export function coordinatesIn(url: string): string | null {
  let text = url
  try {
    text = decodeURIComponent(url)
  } catch {
    // keep it as it is
  }
  for (const pattern of COORDS) {
    const match = text.match(pattern)
    if (match && Math.abs(Number(match[1])) <= 90 && Math.abs(Number(match[2])) <= 180) return `${match[1]},${match[2]}`
  }
  return null
}

/** A search typed into the link (…/maps?q=Sokha+Hotel or /maps/search/Sokha+Hotel), or null. */
function searchIn(url: string): string | null {
  try {
    const parsed = new URL(url)
    const q = parsed.searchParams.get('q') ?? parsed.searchParams.get('query')
    if (q) return q
    const search = parsed.pathname.match(/\/maps\/(?:search|place)\/([^/]+)/)
    return search ? decodeURIComponent(search[1].replace(/\+/g, ' ')) : null
  } catch {
    return null
  }
}

/** What the map should show: coordinates from the link, else its search, else the place and address. */
export function mapQuery(mapsUrl: string, place: string, address: string): string | null {
  return (
    (mapsUrl && (coordinatesIn(mapsUrl) ?? searchIn(mapsUrl))) || [place, address].map((s) => s.trim()).filter(Boolean).join(', ') || null
  )
}

/** The page-frame address for a map of `query`. */
export function embedUrl(query: string, zoom = 15): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`
}

/** Where tapping the map goes: the organizer's link, or a Google Maps search for the place. */
export function openUrl(mapsUrl: string, query: string): string {
  return mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
