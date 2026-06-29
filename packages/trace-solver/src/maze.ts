import type { PlacedBlock } from "@schematic-engine/placement-solver"
import {
  type Segment,
  runsAlongEdge,
  segmentHitsRect,
  segmentsCross,
} from "./geom"
import type { Point } from "./types"

/** Crossings dominate turns in the lexical cost (BIG >> any turn count). */
const BIG = 1_000_000
/** Offset of the clearance routing channels just outside each block edge. */
const CLEARANCE = 0.5

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
 * minimises (trace crossings, then turns). Returns the polyline (collinear
 * points merged) or null when no path clears the blocks.
 */
export function mazeRoute(
  a: Point,
  b: Point,
  blocks: PlacedBlock[],
  routed: Segment[],
  endpointBlocks: PlacedBlock[] = [],
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

  const endpointSet = new Set(endpointBlocks)
  const passable = (p1: Point, p2: Point) =>
    !blocks.some((blk) => {
      if (segmentHitsRect(p1, p2, blk)) return true // crosses interior
      // Running ALONG an edge: never on chips; on passives only if not an endpoint.
      if (!runsAlongEdge(p1, p2, blk)) return false
      return blk.type === "chip" || !endpointSet.has(blk)
    })
  const crossings = (p1: Point, p2: Point) => {
    let n = 0
    const seg = { a: p1, b: p2 }
    for (const r of routed) if (segmentsCross(seg, r)) n++
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
      const nc = cost + crossings(p1, p2) * BIG + turn
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
