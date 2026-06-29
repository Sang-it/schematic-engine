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

/** Spacing inputs: pins carrying a passive need more room than net/empty pins. */
export interface SpacingOptions {
  /** Chip pin ids that have a passive attached. */
  passivePins?: Set<string>
  /** Min gap between adjacent pins when either has a passive. */
  passiveGap?: number
  /** Min gap between adjacent pins that only have a net / nothing / a break. */
  labelGap?: number
}

/**
 * Lay out a chip's pins: same-side pairs are adjacent + spaced for their
 * passive, other pins use the passive/label gap per neighbour, and the box
 * grows as needed. The box is sized first, then every side is centred within
 * the final dims so each side's two end margins are equal.
 */
export function layoutChipPins(
  pinPositions: PinPosition[],
  size: SchematicSize,
  pairs: SidePair[],
  spacing: SpacingOptions = {},
): { pins: PlacedPin[]; size: SchematicSize } {
  const passivePins = spacing.passivePins ?? new Set<string>()
  const passiveGap = spacing.passiveGap ?? 0
  const labelGap = spacing.labelGap ?? 0
  const bySide: Record<PinSide, string[]> = {
    top: [],
    left: [],
    right: [],
    bottom: [],
  }
  for (const p of pinPositions) bySide[p.side].push(p.pin)

  const origW = size.defaultSchematicWidth
  const origH = size.defaultSchematicHeight
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

  // Pass 1 — measure each side against the ORIGINAL default dim, so gaps don't
  // depend on how much a (later) side grows the box.
  interface SideMeasure {
    ids: string[]
    gaps: number[]
    innerSpan: number
    needed: number
  }
  const measure: Partial<Record<PinSide, SideMeasure>> = {}
  for (const side of SIDE_ORDER) {
    const sidePairs = pairs.filter((p) => p.side === side)
    const ids = reorderAdjacent(bySide[side], sidePairs)
    order[side] = ids
    const n = ids.length
    if (n === 0) continue

    const baseGap = (VERTICAL(side) ? origH : origW) / (n + 1)

    // Gap before pin i: a same-side pair forces its own gap; otherwise the
    // passive gap if either neighbour has a passive, else the label gap. Each
    // is floored at the even baseline so sparse chips are unchanged.
    const minGapBetween = (a: string, b: string) => {
      const pr = sidePairs.find(
        (p) => (p.pinA === a && p.pinB === b) || (p.pinA === b && p.pinB === a),
      )
      if (pr) return Math.max(baseGap, pr.minGap)
      const needsPassive = passivePins.has(a) || passivePins.has(b)
      return Math.max(baseGap, needsPassive ? passiveGap : labelGap)
    }
    const gaps: number[] = [baseGap] // leading margin reference
    for (let i = 1; i < n; i++) gaps.push(minGapBetween(ids[i - 1], ids[i]))
    const innerSpan = gaps.slice(1).reduce((a, b) => a + b, 0)
    measure[side] = { ids, gaps, innerSpan, needed: innerSpan + 2 * baseGap }
  }

  // Pass 2 — size the box from both sides on each axis, then centre every side
  // within the FINAL dim (equal margins at both ends).
  const width = Math.max(
    origW,
    measure.top?.needed ?? 0,
    measure.bottom?.needed ?? 0,
  )
  const height = Math.max(
    origH,
    measure.left?.needed ?? 0,
    measure.right?.needed ?? 0,
  )
  for (const side of SIDE_ORDER) {
    const m = measure[side]
    if (!m) continue
    const dim = VERTICAL(side) ? height : width
    let cursor = (dim - m.innerSpan) / 2
    pos[side].set(m.ids[0], cursor)
    for (let i = 1; i < m.ids.length; i++) {
      cursor += m.gaps[i]
      pos[side].set(m.ids[i], cursor)
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
