import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import { CHIP_4_SIDES } from "./helpers"

test("single-connection passive on the left pin is rotated 180", () => {
  const { blocks } = solveSchematic(
    build(`
      ${CHIP_4_SIDES}
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
    `),
  )
  const r1 = blocks.find((b) => b.name === "R1")!
  expect(r1.rotation).toBe(180)
  expect(r1.x).toBeLessThan(0) // to the left of the chip
  expect(r1.pins.find((p) => p.pin === "pin1")!.side).toBe("right")
})
