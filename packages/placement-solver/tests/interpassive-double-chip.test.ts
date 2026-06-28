import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("double passive (chip + passive) anchors a free chip pin", () => {
  const { blocks, connections } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1"], top: ["pin2"] }} connections={{ pin1: "net.A", pin2: "net.B" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin2", pin2: "R1.pin2" }} />
    `),
  )
  const c1 = blocks.find((b) => b.name === "C1")!
  // chip pin2 (top) has no aligned passive -> C1 anchors it, above the chip.
  // A double touching a passive is laid out like a single (pin faces the chip).
  expect(c1.y).toBeLessThan(0)
  expect(c1.pins.find((p) => p.pin === "pin1")!.side).toBe("bottom")
  // R1<->chip, C1<->chip.pin2, C1<->R1.pin2
  expect(connections).toHaveLength(3)
})
