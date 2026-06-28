import type {
  Capacitor,
  Chip,
  Resistor,
  SchematicAst,
} from "@schematic-engine/core"
import { computePinCoords } from "./pin-coords"
import type { BlockType, PlacedBlock } from "./types"

/** Horizontal gap between sequentially placed blocks, in schematic units. */
const GAP = 1

/**
 * Naive sequential placement: lay every component out left-to-right on a
 * single row using its `schematicSize`. No routing / overlap avoidance yet —
 * this only proves the AST -> blocks -> render pipeline. Pin positions from
 * core are offset by each block's origin into absolute coordinates.
 */
export function placeSequentially(ast: SchematicAst): PlacedBlock[] {
  const components: Array<{
    type: BlockType
    comp: Chip | Resistor | Capacitor
  }> = [
    ...ast.chips.map((comp) => ({ type: "chip" as const, comp })),
    ...ast.resistors.map((comp) => ({ type: "resistor" as const, comp })),
    ...ast.capacitors.map((comp) => ({ type: "capacitor" as const, comp })),
  ]

  const blocks: PlacedBlock[] = []
  let cursorX = 0
  for (const { type, comp } of components) {
    const { schematicWidth: w, schematicHeight: h } = comp.schematicSize
    const x = cursorX
    const y = 0
    blocks.push({
      type,
      name: comp.name,
      x,
      y,
      width: w,
      height: h,
      rotation: 0,
      pins: computePinCoords(comp.pinPositions, comp.schematicSize, x, y),
    })
    cursorX += w + GAP
  }
  return blocks
}
