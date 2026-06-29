import type { PinSide } from "@schematic-engine/core"

export type BlockType = "chip" | "resistor" | "capacitor"

/** A pin placed in absolute schematic-unit coordinates on a block's boundary. */
export interface PlacedPin {
  pin: string
  side: PinSide
  x: number
  y: number
  /** Net this pin connects to (when its connection targets a net), if any. */
  net?: string
}

/** A component placed on the schematic, in schematic units (top-left origin). */
export interface PlacedBlock {
  type: BlockType
  name: string
  x: number
  y: number
  width: number
  height: number
  /** Rotation applied to the symbol, in degrees (0 / 90 / 180 / 270). */
  rotation: number
  pins: PlacedPin[]
}

/** A drawn connection between two pin coordinates (schematic units). */
export interface PlacedConnection {
  x1: number
  y1: number
  x2: number
  y2: number
  /**
   * Whether the trace solver should route this connection. Absent / true: route
   * as usual. False: the two endpoints are too far apart to wire cleanly (e.g.
   * non-adjacent chips in the grid) — the trace solver must label both ends with
   * a shared net-label number instead of drawing a wire.
   */
  routable?: boolean
}

/** Full placement result: positioned blocks plus the wires between them. */
export interface Placement {
  blocks: PlacedBlock[]
  connections: PlacedConnection[]
}
