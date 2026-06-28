import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("double passive connected to two placed passives anchors the least-busy one", () => {
  const { blocks, connections } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2"] }} connections={{ pin1: "net.A", pin2: "net.B" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2" }} />
      <capacitor name="C1" connections={{ pin1: "R1.pin2", pin2: "R2.pin2" }} />
    `),
  )
  const r1 = blocks.find((b) => b.name === "R1")!
  const c1 = blocks.find((b) => b.name === "C1")!
  // A double touching passives is laid out like a single: anchored to R1.pin2
  // (right edge), facing it (horizontal), placed further right.
  expect(c1.width).toBeGreaterThan(c1.height)
  expect(c1.x).toBeGreaterThan(r1.x)
  expect(c1.pins.find((p) => p.pin === "pin1")!.side).toBe("left")
  // R1<->chip, R2<->chip, C1<->R1, C1<->R2
  expect(connections).toHaveLength(4)
})
