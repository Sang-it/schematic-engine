import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("single passive connected to a passive faces it on the same axis", () => {
  const { blocks, connections } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1"] }} connections={{ pin1: "net.A" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <capacitor name="C1" connections={{ pin1: "R1.pin2" }} />
    `),
  )
  const r1 = blocks.find((b) => b.name === "R1")!
  const c1 = blocks.find((b) => b.name === "C1")!
  // R1.pin2 is on its right edge -> C1 sits further right, pin facing left.
  expect(c1.x).toBeGreaterThan(r1.x)
  expect(c1.y).toBe(r1.y) // same axis, no vertical move
  expect(c1.pins.find((p) => p.pin === "pin1")!.side).toBe("left")
  // R1<->chip and C1<->R1
  expect(connections).toHaveLength(2)
})
