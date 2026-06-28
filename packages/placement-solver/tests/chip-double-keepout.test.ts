import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("a chip-double reserves its channel; later passives are pushed clear", () => {
  // R1 bridges right pins 1 & 2; R2 anchors pin1 (inside R1's channel). R2 must
  // be pushed past R1 so the channel between the chip and R1 stays clear.
  const { blocks } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2"] }} connections={{ pin1: "net.A", pin2: "net.B" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1", pin2: "U1.pin2" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin1" }} />
    `),
  )
  const r1 = blocks.find((b) => b.name === "R1")!
  const r2 = blocks.find((b) => b.name === "R2")!
  // R2 sits beyond R1's outer edge (outside the reserved channel).
  expect(r2.x).toBeGreaterThanOrEqual(r1.x + r1.width)
})
