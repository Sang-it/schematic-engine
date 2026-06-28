import type { PinSide } from "@schematic-engine/core"

export type BlockType = "chip" | "resistor" | "capacitor"

/** A pin placed in absolute schematic-unit coordinates on a block's boundary. */
export interface PlacedPin {
  pin: string
  side: PinSide
  x: number
  y: number
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
}

/** Full placement result: positioned blocks plus the wires between them. */
export interface Placement {
  blocks: PlacedBlock[]
  connections: PlacedConnection[]
}
