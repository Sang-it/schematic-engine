import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import { CHIP_4_SIDES } from "./helpers"

test("colliding passives are shifted along x (never y)", () => {
  // Two resistors both connect to the SAME chip pin -> same target spot.
  const { blocks } = solveSchematic(
    build(`
      ${CHIP_4_SIDES}
      <resistor name="R1" connections={{ pin1: "U1.pin2" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2" }} />
    `),
  )
  const r1 = blocks.find((b) => b.name === "R1")!
  const r2 = blocks.find((b) => b.name === "R2")!
  expect(r1.y).toBe(r2.y) // same row, no vertical movement
  expect(r2.x).not.toBe(r1.x) // shifted along x
  // cleared with a real gap, not flush against each other
  const [lo, hi] = r1.x < r2.x ? [r1, r2] : [r2, r1]
  expect(hi.x - (lo.x + lo.width)).toBeGreaterThanOrEqual(1)
})
