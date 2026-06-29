import type { PinSide } from "@schematic-engine/core"
import type {
  Placement,
  PlacedBlock,
  PlacedPin,
} from "@schematic-engine/placement-solver"
import type { Point, RoutedSchematic } from "./types"

/** Margin (schematic units) by which a block is shrunk before testing, so a
 * trace that merely grazes a block edge isn't treated as blocked. */
const EPS = 0.01

const key = (x: number, y: number) => `${x},${y}`

/** True if the segment p1->p2 passes through the rect's (shrunk) interior. */
function segmentHitsRect(p1: Point, p2: Point, rect: PlacedBlock): boolean {
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
 * Route each placement connection between its two pins:
 *  1. a straight line, if it clears every other block;
 *  2. else an L (move on one axis to align, then the other); first clear wins;
 *  3. else the trace is dropped and both pins get an outward net label, numbered
 *     1, 2, 3, … (both ends of one broken trace share a number).
 */
export function solveTraces(placement: Placement): RoutedSchematic {
  const { blocks, connections } = placement
  const pinAt = new Map<string, { pin: PlacedPin; block: PlacedBlock }>()
  for (const block of blocks) {
    for (const pin of block.pins) pinAt.set(key(pin.x, pin.y), { pin, block })
  }

  const result: RoutedSchematic = { blocks, traces: [], labels: [] }
  let broken = 0

  for (const c of connections) {
    const a: Point = { x: c.x1, y: c.y1 }
    const b: Point = { x: c.x2, y: c.y2 }
    const ea = pinAt.get(key(a.x, a.y))
    const eb = pinAt.get(key(b.x, b.y))
    const obstacles = blocks.filter(
      (block) => block !== ea?.block && block !== eb?.block,
    )
    const clear = (p1: Point, p2: Point) =>
      !obstacles.some((o) => segmentHitsRect(p1, p2, o))

    // Straight only when the pins share an axis (traces are Manhattan).
    const axisAligned = a.x === b.x || a.y === b.y
    if (axisAligned && clear(a, b)) {
      result.traces.push({ points: [a, b] })
      continue
    }

    // Pick the elbow so each pin leaves along its facing axis (left/right pins
    // go horizontal first, top/bottom go vertical), recovering Manhattan routes
    // that exit the pin outward. Fall back to a fixed order if a side is unknown.
    const cornerFor = (
      p: Point,
      side: PinSide | undefined,
      other: Point,
    ): Point =>
      side === "left" || side === "right"
        ? { x: other.x, y: p.y }
        : { x: p.x, y: other.y }
    const corners: Point[] = [
      cornerFor(a, ea?.pin.side, b),
      cornerFor(b, eb?.pin.side, a),
    ]
    const elbow = corners.find((corner) => clear(a, corner) && clear(corner, b))
    if (elbow) {
      result.traces.push({ points: [a, elbow, b] })
      continue
    }

    // Unroutable: label both ends with the same number.
    broken += 1
    const label = String(broken)
    if (ea) result.labels.push({ x: a.x, y: a.y, side: ea.pin.side, label })
    if (eb) result.labels.push({ x: b.x, y: b.y, side: eb.pin.side, label })
  }

  return result
}
