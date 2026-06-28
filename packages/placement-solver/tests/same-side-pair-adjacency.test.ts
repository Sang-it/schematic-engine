import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("same-side double makes its two chip pins adjacent, spaced, and grows the box", () => {
  // 6 pins on the right edge; C1 bridges pin1 and pin5 (not adjacent by default).
  const { blocks } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2", "pin3", "pin4", "pin5", "pin6"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D", pin5: "net.E", pin6: "net.F" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin1", pin2: "U1.pin5" }} />
    `),
  )
  const u1 = blocks.find((b) => b.name === "U1")!
  const c1 = blocks.find((b) => b.name === "C1")!

  // The two bridged pins are now adjacent on the right edge (consecutive by y).
  const right = u1.pins
    .filter((p) => p.side === "right")
    .sort((a, b) => a.y - b.y)
  const i1 = right.findIndex((p) => p.pin === "pin1")
  const i5 = right.findIndex((p) => p.pin === "pin5")
  expect(Math.abs(i1 - i5)).toBe(1)

  // Their spacing fits the capacitor (its vertical extent here = its width = 1).
  const p1 = right[i1]
  const p5 = right[i5]
  expect(Math.abs(p5.y - p1.y)).toBeGreaterThanOrEqual(1)

  // The box grew beyond the default height (8) to make room.
  expect(u1.height).toBeGreaterThan(8)

  // C1 sits centred between the two pins.
  const mid = (p1.y + p5.y) / 2
  expect(c1.y + c1.height / 2).toBeCloseTo(mid)
})
