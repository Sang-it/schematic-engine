import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("double-connection passive on same-side pins is centred between them", () => {
  const { blocks, connections } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2"] }} connections={{ pin1: "net.A", pin2: "net.B" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1", pin2: "U1.pin2" }} />
    `),
  )
  const u1 = blocks[0]
  const r1 = blocks.find((b) => b.name === "R1")!
  // Both chip pins on the right edge -> runs vertical (parallel to the edge).
  expect(r1.rotation).toBe(90)
  expect(r1.width).toBeLessThan(r1.height)
  expect(r1.x).toBeGreaterThanOrEqual(u1.width)
  expect(r1.pins.find((p) => p.pin === "pin1")!.side).toBe("top")
  // Centred: its midpoint sits halfway between the two chip pins, not on one.
  const chipMid =
    (u1.pins.find((p) => p.pin === "pin1")!.y +
      u1.pins.find((p) => p.pin === "pin2")!.y) /
    2
  expect(r1.y + r1.height / 2).toBeCloseTo(chipMid)
  // both pins still wired to the chip
  expect(connections).toHaveLength(2)
})
