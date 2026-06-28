import type { PinPosition, PinSides } from "./types"

/** Numeric suffix of a pin id ("pin12" -> 12); used for deterministic order. */
function pinNum(id: string): number {
  const m = /(\d+)/.exec(id)
  return m ? Number(m[1]) : 0
}

function sortPins(ids: string[]): string[] {
  return [...ids].sort((a, b) => pinNum(a) - pinNum(b) || a.localeCompare(b))
}

/**
 * Resistor / capacitor default: pin1 on the left edge, pin2 on the right edge.
 * (Each lands at the middle of its edge once coordinates are computed.)
 */
export function defaultTwoPinPositions(): PinPosition[] {
  return [
    { pin: "pin1", side: "left" },
    { pin: "pin2", side: "right" },
  ]
}

/**
 * Chip pin side assignment. If `sides` is given, each pin keeps its declared
 * side and order. Otherwise pins are split between the left and right edges:
 * with an odd count the left edge gets n and the right edge gets n+1.
 */
export function chipPinPositions(
  pinIds: string[],
  sides: PinSides | undefined,
): PinPosition[] {
  if (sides && (sides.top || sides.left || sides.right || sides.bottom)) {
    return [
      ...(sides.top ?? []).map((pin) => ({ pin, side: "top" as const })),
      ...(sides.left ?? []).map((pin) => ({ pin, side: "left" as const })),
      ...(sides.right ?? []).map((pin) => ({ pin, side: "right" as const })),
      ...(sides.bottom ?? []).map((pin) => ({ pin, side: "bottom" as const })),
    ]
  }

  const ordered = sortPins(pinIds)
  const left = Math.floor(ordered.length / 2)
  return [
    ...ordered.slice(0, left).map((pin) => ({ pin, side: "left" as const })),
    ...ordered.slice(left).map((pin) => ({ pin, side: "right" as const })),
  ]
}
