import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import { CHIP_4_SIDES } from "./helpers"

test("single-connection passive on the right pin faces the chip (no rotation)", () => {
  const { blocks } = solveSchematic(
    build(`
      ${CHIP_4_SIDES}
      <resistor name="R1" connections={{ pin1: "U1.pin2" }} />
    `),
  )
  const r1 = blocks.find((b) => b.name === "R1")!
  expect(r1.rotation).toBe(0)
  // chip pin2 is on the right edge -> resistor sits to the right of the chip
  expect(r1.x).toBeGreaterThanOrEqual(blocks[0].width)
  // connecting pin (pin1) faces the chip on the resistor's left edge
  expect(r1.pins.find((p) => p.pin === "pin1")!.side).toBe("left")
})
