import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import { CHIP_4_SIDES } from "./helpers"

test("single-connection passives on top/bottom pins are vertical", () => {
  const { blocks } = solveSchematic(
    build(`
      ${CHIP_4_SIDES}
      <capacitor name="C1" connections={{ pin1: "U1.pin3" }} />
      <capacitor name="C2" connections={{ pin1: "U1.pin4" }} />
    `),
  )
  const c1 = blocks.find((b) => b.name === "C1")!
  const c2 = blocks.find((b) => b.name === "C2")!
  // vertical: width (0.5) < height (1)
  expect(c1.width).toBeLessThan(c1.height)
  expect(c2.width).toBeLessThan(c2.height)
  expect(c1.y).toBeLessThan(0) // above the chip
  expect(c2.y).toBeGreaterThanOrEqual(blocks[0].height) // below the chip
  expect(c1.pins.find((p) => p.pin === "pin1")!.side).toBe("bottom")
  expect(c2.pins.find((p) => p.pin === "pin1")!.side).toBe("top")
})
