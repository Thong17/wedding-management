import { describe, expect, it } from 'vitest'
import { roadPath } from '@/invite/road'

describe('roadPath', () => {
  it('runs from the top centre through every stop to the bottom centre', () => {
    const d = roadPath([{ x: 50, y: 60 }, { x: 250, y: 160 }, { x: 50, y: 260 }], 300, 320)
    expect(d.startsWith('M 150 0 ')).toBe(true)
    expect(d.endsWith('150 320')).toBe(true)
    // One curve in, one between each pair of stops, one out; each stop is a curve's end point.
    expect(d.match(/C /g)).toHaveLength(4)
    for (const stop of ['50 60', '250 160', '50 260']) expect(d).toContain(`, ${stop}`)
  })

  it('leaves and enters each stop vertically, so the road bends in S-curves', () => {
    const d = roadPath([{ x: 50, y: 100 }, { x: 250, y: 200 }], 300, 300)
    // Between the stops: first control point straight below the first stop, second straight above the next.
    expect(d).toContain('C 50 155, 250 145, 250 200')
  })

  it('draws nothing without stops', () => {
    expect(roadPath([], 300, 300)).toBe('')
  })
})
