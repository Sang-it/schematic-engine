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

/**
 * Build a predicate that decides whether an axis-aligned segment may be drawn,
 * enforcing the routing rules uniformly for the straight/L fast paths and the
 * maze:
 *   1. it may not pass through any block's interior,
 *   2. it may never run along a chip edge,
 *   3. it may run along a passive edge only if that passive owns one of the
 *      route's endpoints (passed in `endpointBlocks`).
 */
export function makeSegmentPassable(
  blocks: PlacedBlock[],
  endpointBlocks: PlacedBlock[],
): (p1: Point, p2: Point) => boolean {
  const ep = new Set(endpointBlocks)
  return (p1, p2) =>
    !blocks.some((blk) => {
      if (segmentHitsRect(p1, p2, blk)) return true // crosses interior
      if (!runsAlongEdge(p1, p2, blk)) return false
      // chips: never along an edge; passives: only the route's own endpoints.
      return blk.type === "chip" || !ep.has(blk)
    })
}

/** A directed segment between two points. */
export interface Segment {
  a: Point
  b: Point
}

/**
 * A routed segment tagged with its connection's two endpoint coordinate keys, so
 * overlap checks can tell whether two traces share a connection (a common pin).
 */
export interface OwnedSegment extends Segment {
  ends: readonly string[]
}

/**
 * True if axis-aligned segments s1, s2 are collinear (same orientation, same
 * line) and their extents overlap by more than EPS — i.e. they run on top of
 * one another. A shared single endpoint (zero-length overlap) does NOT count.
 */
export function segmentsOverlap(s1: Segment, s2: Segment): boolean {
  const v1 = s1.a.x === s1.b.x
  const v2 = s2.a.x === s2.b.x
  if (v1 !== v2) return false // not parallel
  if (v1) {
    if (s1.a.x !== s2.a.x) return false // different vertical lines
    const lo = Math.max(Math.min(s1.a.y, s1.b.y), Math.min(s2.a.y, s2.b.y))
    const hi = Math.min(Math.max(s1.a.y, s1.b.y), Math.max(s2.a.y, s2.b.y))
    return hi - lo > EPS
  }
  if (s1.a.y !== s2.a.y) return false // different horizontal lines
  const lo = Math.max(Math.min(s1.a.x, s1.b.x), Math.min(s2.a.x, s2.b.x))
  const hi = Math.min(Math.max(s1.a.x, s1.b.x), Math.max(s2.a.x, s2.b.x))
  return hi - lo > EPS
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
