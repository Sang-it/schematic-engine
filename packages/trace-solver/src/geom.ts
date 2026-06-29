import type { PlacedBlock } from "@schematic-engine/placement-solver"
import type { Point } from "./types"

/** Margin (schematic units) by which a block is shrunk before testing, so a
 * trace that merely grazes a block edge isn't treated as blocked. */
export const EPS = 0.01

/** True if the segment p1->p2 passes through the rect's (shrunk) interior. */
export function segmentHitsRect(
  p1: Point,
  p2: Point,
  rect: PlacedBlock,
): boolean {
  const xmin = rect.x + EPS
  const xmax = rect.x + rect.width - EPS
  const ymin = rect.y + EPS
  const ymax = rect.y + rect.height - EPS
  if (xmax <= xmin || ymax <= ymin) return false

  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  let t0 = 0
  let t1 = 1
  // Liang–Barsky clipping; returns false when the segment is fully rejected.
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (!clip(-dx, p1.x - xmin)) return false
  if (!clip(dx, xmax - p1.x)) return false
  if (!clip(-dy, p1.y - ymin)) return false
  if (!clip(dy, ymax - p1.y)) return false
  return t0 < t1
}

/**
 * True if the axis-aligned segment p1->p2 runs ALONG one of rect's edges: it is
 * collinear with an edge and overlaps its extent by more than EPS. A
 * perpendicular touch or a single-corner contact is not "running along".
 */
export function runsAlongEdge(
  p1: Point,
  p2: Point,
  rect: PlacedBlock,
): boolean {
  const left = rect.x
  const right = rect.x + rect.width
  const top = rect.y
  const bottom = rect.y + rect.height
  if (p1.x === p2.x) {
    if (p1.x !== left && p1.x !== right) return false
    const y0 = Math.min(p1.y, p2.y)
    const y1 = Math.max(p1.y, p2.y)
    return Math.min(y1, bottom) - Math.max(y0, top) > EPS
  }
  if (p1.y === p2.y) {
    if (p1.y !== top && p1.y !== bottom) return false
    const x0 = Math.min(p1.x, p2.x)
    const x1 = Math.max(p1.x, p2.x)
    return Math.min(x1, right) - Math.max(x0, left) > EPS
  }
  return false
}

/** A directed segment between two points. */
export interface Segment {
  a: Point
  b: Point
}

/**
 * True if axis-aligned segments s1, s2 cross at an interior point (a proper
 * crossing). Shared endpoints and collinear overlaps do NOT count.
 */
export function segmentsCross(s1: Segment, s2: Segment): boolean {
  const h1 = s1.a.y === s1.b.y // s1 horizontal
  const h2 = s2.a.y === s2.b.y
  if (h1 === h2) return false // parallel (both H or both V) -> no proper crossing
  const [h, v] = h1 ? [s1, s2] : [s2, s1]
  const y = h.a.y
  const x = v.a.x
  const hx0 = Math.min(h.a.x, h.b.x)
  const hx1 = Math.max(h.a.x, h.b.x)
  const vy0 = Math.min(v.a.y, v.b.y)
  const vy1 = Math.max(v.a.y, v.b.y)
  // Strict interior on both segments -> a true crossing (not a T/endpoint touch).
  return x > hx0 && x < hx1 && y > vy0 && y < vy1
}
