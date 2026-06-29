import type { PinSide } from "@schematic-engine/core"
import type {
  Placement,
  PlacedBlock,
  PlacedPin,
} from "@schematic-engine/placement-solver"
import { type Segment, segmentHitsRect } from "./geom"
import { mazeRoute } from "./maze"
import type { Point, RoutedSchematic } from "./types"

const key = (x: number, y: number) => `${x},${y}`

/** Segments of a polyline trace. */
const segmentsOf = (pts: Point[]): Segment[] =>
  pts.slice(1).map((p, i) => ({ a: pts[i], b: p }))

/**
 * Route each placement connection between its two pins:
 *  1. a straight line, if it clears every other block;
 *  2. else an L (move on one axis to align, then the other); first clear wins;
 *  3. else a multi-bend Manhattan path around the blocks, picking the route with
 *     the fewest trace crossings, then fewest turns;
 *  4. else the trace is dropped and both pins get an outward net label, numbered
 *     1, 2, 3, … (both ends of one broken trace share a number).
 */
export function solveTraces(placement: Placement): RoutedSchematic {
  const { blocks, connections } = placement
  const pinAt = new Map<string, { pin: PlacedPin; block: PlacedBlock }>()
  for (const block of blocks) {
    for (const pin of block.pins) pinAt.set(key(pin.x, pin.y), { pin, block })
  }

  const result: RoutedSchematic = { blocks, traces: [], labels: [] }
  // Segments of every trace routed so far, so later routes can count crossings.
  const routedSegments: Segment[] = []
  const addTrace = (points: Point[]) => {
    result.traces.push({ points })
    routedSegments.push(...segmentsOf(points))
  }
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
      addTrace([a, b])
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
      addTrace([a, elbow, b])
      continue
    }

    // Escalate: multi-bend route around the blocks (min crossings, then turns).
    // Endpoint owner passives may be run along; chips and other passives can't.
    const endpointBlocks = [ea?.block, eb?.block].filter(
      (x): x is PlacedBlock => x !== undefined,
    )
    const path = mazeRoute(a, b, blocks, routedSegments, endpointBlocks)
    if (path) {
      addTrace(path)
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
