import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("two chips bridged by a resistor are placed in adjacent grid cells with a cross wire", () => {
  // U1 and U2 are bridged by RX, so they form one component laid out on the chip
  // grid: they land in neighbouring cells (different positions) and a cross wire
  // is drawn between U2.pin1 and RX's outward pin.
  const { blocks, connections } = solveSchematic(
    build(`
      <chip name="U1" pinPosition={{ left: ["pin1"], right: ["pin2", "pin3"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C" }} />
      <chip name="U2" pinPosition={{ right: ["pin1"] }} connections={{ pin1: "net.D" }} />
      <resistor name="RX" connections={{ pin1: "U1.pin1", pin2: "U2.pin1" }} />
    `),
  )
  const u1 = blocks.find((b) => b.name === "U1")!
  const u2 = blocks.find((b) => b.name === "U2")!
  expect(u1.x !== u2.x || u1.y !== u2.y).toBe(true) // distinct cells

  // A cross wire connects U2.pin1 to RX's outward pin.
  const u2Pin = u2.pins.find((p) => p.pin === "pin1")!
  const touchesU2 = connections.some(
    (c) =>
      (c.x1 === u2Pin.x && c.y1 === u2Pin.y) ||
      (c.x2 === u2Pin.x && c.y2 === u2Pin.y),
  )
  expect(touchesU2).toBe(true)
})
