import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("two chips are solved independently then packed side by side", () => {
  const { blocks } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2", "pin3"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C" }} />
      <chip name="U2" pinPosition={{ right: ["pin1", "pin2"] }} connections={{ pin1: "net.D", pin2: "net.E" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <capacitor name="C1" connections={{ pin1: "U2.pin1" }} />
    `),
  )
  const u1 = blocks.find((b) => b.name === "U1")!
  const u2 = blocks.find((b) => b.name === "U2")!
  const r1 = blocks.find((b) => b.name === "R1")!
  const c1 = blocks.find((b) => b.name === "C1")!

  // U1 has more connections -> its schematic is packed first (further left).
  expect(u1.x).toBeLessThan(u2.x)
  // R1 belongs to U1's schematic, C1 to U2's.
  expect(r1.x).toBeLessThan(u2.x)
  expect(c1.x).toBeGreaterThan(u2.x)

  // The two chips don't overlap.
  const overlap = !(
    u1.x + u1.width <= u2.x ||
    u2.x + u2.width <= u1.x ||
    u1.y + u1.height <= u2.y ||
    u2.y + u2.height <= u1.y
  )
  expect(overlap).toBe(false)
})

test("a passive shared by two chips is placed once, by the higher-priority chip", () => {
  const { blocks } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2", "pin3"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C" }} />
      <chip name="U2" pinPosition={{ right: ["pin1"] }} connections={{ pin1: "net.D" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1", pin2: "U2.pin1" }} />
    `),
  )
  // R1 appears exactly once (consumed by U1, skipped by U2).
  expect(blocks.filter((b) => b.name === "R1")).toHaveLength(1)
  expect(blocks.filter((b) => b.name === "U1")).toHaveLength(1)
  expect(blocks.filter((b) => b.name === "U2")).toHaveLength(1)
})
