import type { PlacedBlock } from "@schematic-engine/placement-solver"
import {
  CLEARANCE,
  type OwnedSegment,
  makeSegmentPassable,
  segmentsTooClose,
} from "./geom"
import type { Point } from "./types"

/** Crossings dominate turns in the lexical cost (BIG >> any turn count). */
const BIG = 1_000_000
/** Clearance violations dominate crossings (BIG2 >> any crossings*BIG). */
const BIG2 = 1_000_000_000_000

const sortedUnique = (ns: number[]): number[] =>
  [...new Set(ns)].sort((a, b) => a - b)

/** A minimal binary min-heap of [cost, seq, value]. */
class Heap<T> {
  private items: [number, number, T][] = []
  private seq = 0
  push(cost: number, value: T): void {
    const node: [number, number, T] = [cost, this.seq++, value]
    const a = this.items
    a.push(node)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (less(a[i], a[p])) {
        ;[a[i], a[p]] = [a[p], a[i]]
        i = p
      } else break
    }
  }
  pop(): T | undefined {
    const a = this.items
    if (a.length === 0) return undefined
    const top = a[0]
    const last = a.pop() as [number, number, T]
    if (a.length > 0) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && less(a[l], a[m])) m = l
        if (r < a.length && less(a[r], a[m])) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top[2]
  }
  get size(): number {
    return this.items.length
  }
}
const less = (
  x: [number, number, unknown],
  y: [number, number, unknown],
): boolean => (x[0] !== y[0] ? x[0] < y[0] : x[1] < y[1])

type Dir = 0 | 1 // 0 = horizontal move, 1 = vertical move

/**
 * Route a Manhattan (axis-aligned) multi-bend path from `a` to `b` on the Hanan
 * grid of the placement, avoiding block interiors. Among reachable paths it
 * minimises (clearance violations, then crossings·crossWeight, then length, then
 * turns). With `crossWeight = BIG` (default) crossings are avoided first; with
 * `crossWeight = 0` crossings are free and the search returns the SHORTEST path
 * that still respects clearance. Returns the polyline (collinear points merged)
 * or null when no path clears the blocks.
 */
export function mazeRoute(
  a: Point,
  b: Point,
  blocks: PlacedBlock[],
  routed: OwnedSegment[],
  endpointBlocks: PlacedBlock[] = [],
  currentEnds: ReadonlySet<string> = new Set(),
  crossWeight: number = BIG,
): Point[] | null {
  // Hanan grid: block edges + a clearance channel just outside each edge + pin
  // coords + the two endpoints.
  const xsArr: number[] = [a.x, b.x]
  const ysArr: number[] = [a.y, b.y]
  for (const blk of blocks) {
    const l = blk.x
    const r = blk.x + blk.width
    const t = blk.y
    const bot = blk.y + blk.height
    xsArr.push(l, r, l - CLEARANCE, r + CLEARANCE)
    ysArr.push(t, bot, t - CLEARANCE, bot + CLEARANCE)
    for (const p of blk.pins) {
      xsArr.push(p.x)
      ysArr.push(p.y)
    }
  }
  const xs = sortedUnique(xsArr)
  const ys = sortedUnique(ysArr)
  const W = xs.length
  const H = ys.length
  const xi = new Map(xs.map((v, i) => [v, i]))
  const yi = new Map(ys.map((v, i) => [v, i]))

  const ax = xi.get(a.x) as number
  const ay = yi.get(a.y) as number
  const bx = xi.get(b.x) as number
  const by = yi.get(b.y) as number

  const passable = makeSegmentPassable(blocks, endpointBlocks)
  // Crossings of one grid sub-edge (p1->p2) with the already-routed segments.
  // The path is split at every grid line, so a routed trace usually crosses
  // exactly AT a shared vertex of two consecutive sub-edges. A strict-interior
  // test (segmentsCross) would miss those, undercounting crossings and letting
  // the search pick a path that visually crosses traces. So the edge's own span
  // is HALF-OPEN [lo, hi): the crossing at a shared vertex is owned by exactly
  // one of the two sub-edges (counted once, never zero). The routed trace must
  // still cross the perpendicular axis STRICTLY, so a trace merely ending on the
  // path (a T-touch) is not a crossing.
  const crossings = (p1: Point, p2: Point) => {
    const edgeVert = p1.x === p2.x
    let n = 0
    for (const r of routed) {
      const rVert = r.a.x === r.b.x
      if (edgeVert === rVert) continue // parallel: no proper crossing
      if (edgeVert) {
        const x = p1.x
        const ylo = Math.min(p1.y, p2.y)
        const yhi = Math.max(p1.y, p2.y)
        const y = r.a.y
        const rxlo = Math.min(r.a.x, r.b.x)
        const rxhi = Math.max(r.a.x, r.b.x)
        if (x > rxlo && x < rxhi && y >= ylo && y < yhi) n++
      } else {
        const y = p1.y
        const xlo = Math.min(p1.x, p2.x)
        const xhi = Math.max(p1.x, p2.x)
        const x = r.a.x
        const rylo = Math.min(r.a.y, r.b.y)
        const ryhi = Math.max(r.a.y, r.b.y)
        if (y > rylo && y < ryhi && x >= xlo && x < xhi) n++
      }
    }
    return n
  }
  // Routed traces that DON'T share a connection with the current route (owner
  // endpoints disjoint from currentEnds) and run parallel within CLEARANCE.
  const tooClose = (p1: Point, p2: Point) => {
    const seg = { a: p1, b: p2 }
    let n = 0
    for (const r of routed) {
      if (r.ends.some((e) => currentEnds.has(e))) continue // shared connection
      if (segmentsTooClose(seg, r, CLEARANCE)) n++
    }
    return n
  }

  // State id = (i*H + j)*2 + dir.
  const nodes = W * H
  const best = new Float64Array(nodes * 2).fill(Number.POSITIVE_INFINITY)
  const prev = new Int32Array(nodes * 2).fill(-1)
  const heap = new Heap<number>()

  const startId = (ax * H + ay) * 2
  // Seed both directions from A with zero cost (first move is turn-free).
  best[startId] = 0
  best[startId + 1] = 0
  heap.push(0, startId)
  heap.push(0, startId + 1)

  const point = (i: number, j: number): Point => ({ x: xs[i], y: ys[j] })

  while (heap.size > 0) {
    const id = heap.pop() as number
    const dir = (id & 1) as Dir
    const cell = id >> 1
    const i = Math.floor(cell / H)
    const j = cell % H
    const cost = best[id]
    const p1 = point(i, j)
    const neighbors: [number, number, Dir][] = [
      [i - 1, j, 0],
      [i + 1, j, 0],
      [i, j - 1, 1],
      [i, j + 1, 1],
    ]
    for (const [ni, nj, nd] of neighbors) {
      if (ni < 0 || ni >= W || nj < 0 || nj >= H) continue
      const p2 = point(ni, nj)
      if (!passable(p1, p2)) continue
      const turn = id === startId || id === startId + 1 ? 0 : nd !== dir ? 1 : 0
      const len = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y)
      const nc =
        cost +
        tooClose(p1, p2) * BIG2 +
        crossings(p1, p2) * crossWeight +
        len +
        turn
      const nid = (ni * H + nj) * 2 + nd
      if (nc < best[nid]) {
        best[nid] = nc
        prev[nid] = id
        heap.push(nc, nid)
      }
    }
  }

  const endH = (bx * H + by) * 2
  const endV = endH + 1
  const endId = best[endH] <= best[endV] ? endH : endV
  if (!Number.isFinite(best[endId])) return null

  // Reconstruct, then merge collinear points.
  const path: Point[] = []
  for (let id = endId; id !== -1; id = prev[id]) {
    const cell = id >> 1
    path.push(point(Math.floor(cell / H), cell % H))
  }
  path.reverse()
  return mergeCollinear(path)
}

function mergeCollinear(path: Point[]): Point[] {
  const out: Point[] = []
  for (const p of path) {
    if (out.length >= 2) {
      const a = out[out.length - 2]
      const b = out[out.length - 1]
      const sameLine =
        (a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)
      if (sameLine) {
        out[out.length - 1] = p
        continue
      }
    }
    // drop exact duplicates
    if (
      out.length &&
      out[out.length - 1].x === p.x &&
      out[out.length - 1].y === p.y
    )
      continue
    out.push(p)
  }
  return out
}
