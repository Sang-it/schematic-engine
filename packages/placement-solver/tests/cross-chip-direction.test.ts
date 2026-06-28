import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("a bridged chip is placed on the side the connection exits, with a cross wire", () => {
  // RX is anchored to U1.pin1 (U1's LEFT edge); its outward pin faces left and
  // wires to U2. So U2 must sit to the LEFT of U1, and a cross wire is drawn.
  const { blocks, connections } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ left: ["pin1"], right: ["pin2", "pin3"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C" }} />
      <chip name="U2" pinPosition={{ right: ["pin1"] }} connections={{ pin1: "net.D" }} />
      <resistor name="RX" connections={{ pin1: "U1.pin1", pin2: "U2.pin1" }} />
    `),
  )
  const u1 = blocks.find((b) => b.name === "U1")!
  const u2 = blocks.find((b) => b.name === "U2")!
  expect(u2.x).toBeLessThan(u1.x) // exit-left -> U2 left of U1

  // A cross wire connects U2.pin1 to RX's outward pin.
  const u2Pin = u2.pins.find((p) => p.pin === "pin1")!
  const touchesU2 = connections.some(
    (c) =>
      (c.x1 === u2Pin.x && c.y1 === u2Pin.y) ||
      (c.x2 === u2Pin.x && c.y2 === u2Pin.y),
  )
  expect(touchesU2).toBe(true)
})
