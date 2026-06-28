import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("inter-passive: a passive waits for its neighbour, then places", () => {
  // C1 connects only to R1 (a passive). R1 connects to the chip. C1 must be
  // deferred until R1 is placed, then anchored to it.
  const { blocks } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1"] }} connections={{ pin1: "net.A" }} />
      <capacitor name="C1" connections={{ pin1: "R1.pin2" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
    `),
  )
  expect(blocks.map((b) => b.name).sort()).toEqual(["C1", "R1", "U1"])
  const c1 = blocks.find((b) => b.name === "C1")!
  expect(c1.pins).toHaveLength(2) // actually placed, not a bare leftover
})
