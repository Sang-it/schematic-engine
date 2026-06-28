import type {
  PinPosition,
  PinSide,
  SchematicSize,
} from "@schematic-engine/core"
import type { PlacedPin } from "./types"

const SIDE_ORDER: PinSide[] = ["top", "left", "right", "bottom"]

/**
 * Compute absolute pin coordinates for a block placed at (originX, originY).
 *
 * Pins on the same side are spread at equal distances along it, at fractions
 * (i+1)/(n+1) of the edge length. Order within a side follows `pinPositions`:
 *   - vertical sides (left/right): top -> down  (increasing y)
 *   - horizontal sides (top/bottom): left -> right (increasing x)
 */
export function computePinCoords(
  pinPositions: PinPosition[],
  size: SchematicSize,
  originX: number,
  originY: number,
): PlacedPin[] {
  const { defaultSchematicWidth: w, defaultSchematicHeight: h } = size
  const bySide: Record<PinSide, PinPosition[]> = {
    top: [],
    left: [],
    right: [],
    bottom: [],
  }
  for (const p of pinPositions) bySide[p.side].push(p)

  const out: PlacedPin[] = []
  for (const side of SIDE_ORDER) {
    const arr = bySide[side]
    const n = arr.length
    arr.forEach((p, i) => {
      const t = (i + 1) / (n + 1)
      let x: number
      let y: number
      if (side === "top") {
        x = w * t
        y = 0
      } else if (side === "bottom") {
        x = w * t
        y = h
      } else if (side === "left") {
        x = 0
        y = h * t
      } else {
        x = w
        y = h * t
      }
      out.push({ pin: p.pin, side, x: originX + x, y: originY + y })
    })
  }
  return out
}

/** A pair of same-side pins that must be adjacent with at least `minGap`. */
export interface SidePair {
  side: PinSide
  pinA: string
  pinB: string
  minGap: number
}

const VERTICAL = (s: PinSide) => s === "left" || s === "right"

/**
 * Lay out a chip's pins so that each connected same-side pair is adjacent and
 * far enough apart to fit its bridging passive, growing the chip box when the
 * required spacing exceeds the default. Sides without such pairs (and pairs
 * whose required gap is already met by the even spacing) reproduce the plain
 * even spread, so unaffected chips are unchanged.
 */
export function layoutChipPins(
  pinPositions: PinPosition[],
  size: SchematicSize,
  pairs: SidePair[],
  minPinGap = 0,
): { pins: PlacedPin[]; size: SchematicSize } {
  const bySide: Record<PinSide, string[]> = {
    top: [],
    left: [],
    right: [],
    bottom: [],
  }
  for (const p of pinPositions) bySide[p.side].push(p.pin)

  let width = size.defaultSchematicWidth
  let height = size.defaultSchematicHeight
  // Per-side ordered pin list + the position of each pin along its edge.
  const order: Record<PinSide, string[]> = {
    top: [],
    left: [],
    right: [],
    bottom: [],
  }
  const pos: Record<PinSide, Map<string, number>> = {
    top: new Map(),
    left: new Map(),
    right: new Map(),
    bottom: new Map(),
  }

  for (const side of SIDE_ORDER) {
    const sidePairs = pairs.filter((p) => p.side === side)
    const ids = reorderAdjacent(bySide[side], sidePairs)
    order[side] = ids
    const n = ids.length
    if (n === 0) continue

    const defaultDim = VERTICAL(side) ? height : width
    // Floor the spacing so two single passives on adjacent pins still fit.
    const regularGap = Math.max(defaultDim / (n + 1), minPinGap)

    // Required gap before each pin (gap[0] = leading margin).
    const minGapBetween = (a: string, b: string) => {
      const pr = sidePairs.find(
        (p) => (p.pinA === a && p.pinB === b) || (p.pinA === b && p.pinB === a),
      )
      return pr ? Math.max(regularGap, pr.minGap) : regularGap
    }
    const gaps: number[] = [regularGap]
    for (let i = 1; i < n; i++) gaps.push(minGapBetween(ids[i - 1], ids[i]))
    const needed = gaps.reduce((a, b) => a + b, 0) + regularGap // trailing margin

    const dim = Math.max(defaultDim, needed)
    if (VERTICAL(side)) height = Math.max(height, dim)
    else width = Math.max(width, dim)

    // Centre the run of pins within the (possibly grown) edge.
    const start = (dim - (needed - 2 * regularGap)) / 2
    let cursor = start
    pos[side].set(ids[0], cursor)
    for (let i = 1; i < n; i++) {
      cursor += gaps[i]
      pos[side].set(ids[i], cursor)
    }
  }

  // Resolve to absolute coordinates against the final box size.
  const pins: PlacedPin[] = []
  for (const side of SIDE_ORDER) {
    for (const pin of order[side]) {
      const t = pos[side].get(pin) as number
      let x: number
      let y: number
      if (side === "top") {
        x = t
        y = 0
      } else if (side === "bottom") {
        x = t
        y = height
      } else if (side === "left") {
        x = 0
        y = t
      } else {
        x = width
        y = t
      }
      pins.push({ pin, side, x, y })
    }
  }
  return {
    pins,
    size: { defaultSchematicWidth: width, defaultSchematicHeight: height },
  }
}

/** Reorder a side's pins so each pair's second member follows the first. */
function reorderAdjacent(ids: string[], sidePairs: SidePair[]): string[] {
  if (sidePairs.length === 0) return ids
  const result = [...ids]
  for (const { pinA, pinB } of sidePairs) {
    const ai = result.indexOf(pinA)
    const bi = result.indexOf(pinB)
    if (ai === -1 || bi === -1 || bi === ai + 1) continue
    result.splice(bi, 1)
    result.splice(result.indexOf(pinA) + 1, 0, pinB)
  }
  return result
}
