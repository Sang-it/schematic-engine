import type { PinSide } from "@schematic-engine/core"
import type {
  Placement,
  PlacedBlock,
  PlacedPin,
} from "@schematic-engine/placement-solver"
import {
  CLEARANCE,
  type OwnedSegment,
  type Segment,
  makeSegmentPassable,
  segmentsTooClose,
} from "./geom"
import { mazeRoute } from "./maze"
import type { Point, RoutedSchematic } from "./types"

const key = (x: number, y: number) => `${x},${y}`

/** A path is dropped (and labelled) when it is longer than this multiple of the
 * direct pin-to-pin distance — a far-wrapping detour reads worse than a label. */
const MAX_PATH_RATIO = 3

/** Total Manhattan length of a polyline. */
const pathLength = (pts: Point[]): number => {
  let n = 0
  for (let i = 1; i < pts.length; i++) {
    n += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y)
  }
  return n
}

/** Segments of a polyline trace. */
const segmentsOf = (pts: Point[]): Segment[] =>
  pts.slice(1).map((p, i) => ({ a: pts[i], b: p }))

// Net-label box geometry in schematic units. MUST mirror render.ts (its pixel
// constants / SCALE): LABEL_OUT 6px, LABEL_BOX 6px, font 3px at SCALE 20.
const LABEL_OUT = 0.3 // gap from pin to the near edge of the box
const LABEL_THICK = 0.3 // box size across the edge
const labelLen = (text: string) =>
  Math.max(LABEL_THICK, (text.length * 3 * 0.7 + 2) / 20)

/**
 * The rectangle a pin's outward net label occupies, as an obstacle block so
 * traces route around labels instead of through them.
 */
function labelBox(p: PlacedPin, text: string): PlacedBlock {
  const len = labelLen(text)
  let x: number
  let y: number
  let width: number
  let height: number
  if (p.side === "left") {
    x = p.x - LABEL_OUT - len
    y = p.y - LABEL_THICK / 2
    width = len
    height = LABEL_THICK
  } else if (p.side === "right") {
    x = p.x + LABEL_OUT
    y = p.y - LABEL_THICK / 2
    width = len
    height = LABEL_THICK
  } else if (p.side === "top") {
    x = p.x - LABEL_THICK / 2
    y = p.y - LABEL_OUT - len
    width = LABEL_THICK
    height = len
  } else {
    x = p.x - LABEL_THICK / 2
    y = p.y + LABEL_OUT
    width = LABEL_THICK
    height = len
  }
  // type "chip" => interior blocks AND no edge-run, never an endpoint: a hard
  // keep-out the way a label should be.
  return {
    type: "chip",
    name: "__net_label__",
    x,
    y,
    width,
    height,
    rotation: 0,
    pins: [],
  }
}

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
  // Segments of every trace routed so far (tagged with their connection's two
  // endpoint keys), so later routes can count crossings and overlaps.
  const routedSegments: OwnedSegment[] = []
  const addTrace = (points: Point[], ends: readonly string[]) => {
    result.traces.push({ points })
    for (const s of segmentsOf(points)) routedSegments.push({ ...s, ends })
  }
  let broken = 0

  // Net labels are obstacles too. Pre-compute the boxes known up front so traces
  // route around them: net-name labels on net-only pins (a net pin no connection
  // wires) and the numbered labels of label-only connections. Unroutable
  // fallbacks add their boxes during the loop, blocking later traces.
  const connEndpoints = new Set<string>()
  for (const c of connections) {
    connEndpoints.add(key(c.x1, c.y1))
    connEndpoints.add(key(c.x2, c.y2))
  }
  const labelObstacles: PlacedBlock[] = []
  for (const block of blocks) {
    for (const pin of block.pins) {
      if (pin.net !== undefined && !connEndpoints.has(key(pin.x, pin.y))) {
        labelObstacles.push(labelBox(pin, pin.net))
      }
    }
  }
  for (const c of connections) {
    if (c.routable !== false) continue
    const ea = pinAt.get(key(c.x1, c.y1))
    const eb = pinAt.get(key(c.x2, c.y2))
    if (ea) labelObstacles.push(labelBox(ea.pin, "0"))
    if (eb) labelObstacles.push(labelBox(eb.pin, "0"))
  }

  for (const c of connections) {
    const a: Point = { x: c.x1, y: c.y1 }
    const b: Point = { x: c.x2, y: c.y2 }
    const ea = pinAt.get(key(a.x, a.y))
    const eb = pinAt.get(key(b.x, b.y))
    // Label-only connection (e.g. non-adjacent chips): don't route it — label
    // both ends with a shared number, like an unroutable fallback.
    if (c.routable === false) {
      broken += 1
      const label = String(broken)
      if (ea) result.labels.push({ x: a.x, y: a.y, side: ea.pin.side, label })
      if (eb) result.labels.push({ x: b.x, y: b.y, side: eb.pin.side, label })
      continue
    }

    // Same rule set as the maze, so a straight/L that would cut through a block
    // or hug a forbidden edge is rejected and escalates instead of being drawn.
    // Label boxes are obstacles too, so traces don't run through net labels.
    const endpointBlocks = [ea?.block, eb?.block].filter(
      (x): x is PlacedBlock => x !== undefined,
    )
    const obstacleBlocks = [...blocks, ...labelObstacles]
    const passable = makeSegmentPassable(obstacleBlocks, endpointBlocks)

    // This connection's endpoint keys: a trace may overlap another only if they
    // share one (the same pin). Reject overlap with any non-sharing routed trace.
    const ends = [key(a.x, a.y), key(b.x, b.y)] as const
    const currentEnds = new Set<string>(ends)
    const tooCloseToTrace = (p1: Point, p2: Point) => {
      const seg = { a: p1, b: p2 }
      return routedSegments.some(
        (r) =>
          !r.ends.some((e) => currentEnds.has(e)) &&
          segmentsTooClose(seg, r, CLEARANCE),
      )
    }

    // Straight only when the pins share an axis (traces are Manhattan).
    const axisAligned = a.x === b.x || a.y === b.y
    if (axisAligned && passable(a, b) && !tooCloseToTrace(a, b)) {
      addTrace([a, b], ends)
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
    const elbow = corners.find(
      (corner) =>
        passable(a, corner) &&
        passable(corner, b) &&
        !tooCloseToTrace(a, corner) &&
        !tooCloseToTrace(corner, b),
    )
    if (elbow) {
      addTrace([a, elbow, b], ends)
      continue
    }

    // Escalate: multi-bend route around the blocks. Accept a route only if it
    // isn't a far detour (a path more than MAX_PATH_RATIO times the direct pin
    // distance). Pass 1 minimises crossings; if its best route blows the budget
    // (it would have to wander far to stay crossing-free), pass 2 takes the
    // shortest path even if it crosses traces — a short crossing reads better
    // than a label. Both still respect clearance and never enter/hug blocks.
    const direct = Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    const budget = MAX_PATH_RATIO * direct
    const clean = mazeRoute(
      a,
      b,
      obstacleBlocks,
      routedSegments,
      endpointBlocks,
      currentEnds,
    )
    let path: Point[] | null =
      clean && pathLength(clean) <= budget ? clean : null
    if (!path) {
      const short = mazeRoute(
        a,
        b,
        obstacleBlocks,
        routedSegments,
        endpointBlocks,
        currentEnds,
        0, // crossWeight: crossings free -> shortest path
      )
      if (short && pathLength(short) <= budget) path = short
    }
    if (path) {
      addTrace(path, ends)
      continue
    }

    // Unroutable: label both ends with the same number, and block those boxes
    // for the traces still to come.
    broken += 1
    const label = String(broken)
    if (ea) {
      result.labels.push({ x: a.x, y: a.y, side: ea.pin.side, label })
      labelObstacles.push(labelBox(ea.pin, label))
    }
    if (eb) {
      result.labels.push({ x: b.x, y: b.y, side: eb.pin.side, label })
      labelObstacles.push(labelBox(eb.pin, label))
    }
  }

  return result
}
