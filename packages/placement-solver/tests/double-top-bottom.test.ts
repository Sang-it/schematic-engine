import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

test("double-connection passive on top/bottom pins runs horizontal", () => {
  const { blocks } = solveSchematic(
    build(`
      <chip
        name="U1"
        pinPosition={{ top: ["pin1", "pin2"], left: ["pin3", "pin4"], right: ["pin5", "pin6"], bottom: ["pin7", "pin8"] }}
        connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D", pin5: "net.E", pin6: "net.F", pin7: "net.G", pin8: "net.H" }}
      />
      <resistor name="R3" connections={{ pin1: "U1.pin4", pin2: "U1.pin6" }} />
      <capacitor name="C3" connections={{ pin1: "U1.pin2", pin2: "U1.pin8" }} />
    `),
  )
  // C3 anchors pin1 -> chip pin2 (top edge) and runs parallel to it (horizontal).
  const c3 = blocks.find((b) => b.name === "C3")!
  expect(c3.y).toBeLessThan(0) // above the chip
  expect(c3.width).toBeGreaterThan(c3.height) // horizontal
  expect(c3.pins.find((p) => p.pin === "pin1")!.side).toBe("left")
})
