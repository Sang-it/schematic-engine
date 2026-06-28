import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("dense side keeps a minimum pin gap so adjacent passives fit; box grows", () => {
  // 10 pins on the right edge would crush the even spacing (8/11 < 1). Two
  // single resistors on adjacent pins must still fit, so the gap is floored and
  // the chip box grows.
  const conns = Array.from(
    { length: 10 },
    (_, i) => `pin${i + 1}: "net.N${i + 1}"`,
  ).join(", ")
  const { blocks } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2", "pin3", "pin4", "pin5", "pin6", "pin7", "pin8", "pin9", "pin10"] }} connections={{ ${conns} }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2" }} />
    `),
  )
  const u1 = blocks.find((b) => b.name === "U1")!
  const r1 = blocks.find((b) => b.name === "R1")!
  const r2 = blocks.find((b) => b.name === "R2")!

  // Adjacent right-edge pins are spaced at least the floor (passive height 0.5
  // + clearance 0.5 = 1.0), even though even spacing would be 8/11 ≈ 0.73.
  const right = u1.pins
    .filter((p) => p.side === "right")
    .sort((a, b) => a.y - b.y)
  expect(right[1].y - right[0].y).toBeGreaterThanOrEqual(1)

  // The box grew beyond the default height to hold the floored spacing.
  expect(u1.height).toBeGreaterThan(8)

  // The two adjacent-pin passives don't overlap.
  const overlap = !(r1.y + r1.height <= r2.y || r2.y + r2.height <= r1.y)
  expect(overlap).toBe(false)
})
