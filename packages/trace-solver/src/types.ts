import type { PinSide } from "@schematic-engine/core"
import type { PlacedBlock } from "@schematic-engine/placement-solver"

export interface Point {
  x: number
  y: number
}

/** A routed trace: 2 points for a straight run, 3 for an L (with a corner). */
export interface RoutedTrace {
  points: Point[]
}

/** An outward net label placed on a pin whose trace could not be routed. */
export interface NetLabel {
  x: number
  y: number
  side: PinSide
  label: string
}

/** Routing result: the placed blocks, the routed traces, and any net labels. */
export interface RoutedSchematic {
  blocks: PlacedBlock[]
  traces: RoutedTrace[]
  labels: NetLabel[]
}
