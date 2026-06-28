import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg, solveSchematic } from "../src/index"
import "./helpers"

// Real-world-ish MCU subcircuit: VDD/VSS decoupling caps, a reset pull-up and
// a boot pull-down, plus an output pin feeding an RC low-pass (R5 -> C3).
const CIRCUIT = `
  <chip
    name="U1"
    pinPosition={{ top: ["pin1"], left: ["pin2", "pin3"], right: ["pin4"], bottom: ["pin5"] }}
    connections={{ pin1: "net.VDD", pin2: "net.NRST", pin3: "net.BOOT0", pin4: "net.PA0", pin5: "net.VSS" }}
  />
  <resistor name="R1" connections={{ pin1: "U1.pin2" }} />
  <resistor name="R2" connections={{ pin1: "U1.pin3" }} />
  <resistor name="R5" connections={{ pin1: "U1.pin4" }} />
  <capacitor name="C1" connections={{ pin1: "U1.pin1" }} />
  <capacitor name="C2" connections={{ pin1: "U1.pin5" }} />
  <capacitor name="C3" connections={{ pin1: "R5.pin2" }} />
`

test("real-world MCU subcircuit places every component and wires it", () => {
  const { blocks, connections } = solveSchematic(build(CIRCUIT))

  // chip + 3 resistors + 3 capacitors, all placed (none fell through to a row).
  expect(blocks).toHaveLength(7)
  for (const b of blocks) expect(b.pins.length).toBeGreaterThan(0)

  // 5 single chip passives (R1,R2,R5,C1,C2) + C3<->R5 = 6 wires.
  expect(connections).toHaveLength(6)

  // No two blocks overlap.
  const overlap = (a: (typeof blocks)[number], b: (typeof blocks)[number]) =>
    !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    )
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      expect(overlap(blocks[i], blocks[j])).toBe(false)
    }
  }

  expect(astToSchematicSvg(build(CIRCUIT))).toMatchSchematicSvg(
    import.meta.path,
  )
})
