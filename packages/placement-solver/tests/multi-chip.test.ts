import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

// Three chips, each with its own passives, solved independently then packed
// into a row (3 per row).
test("multi-chip schematic renders to svg", () => {
  const svg = astToSchematicSvg(
    build(`
      <chip name="U1" pinPosition={{ left: ["pin1"], right: ["pin2", "pin3"], top: ["pin4"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2", pin2: "U1.pin3" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin4" }} />

      <chip name="U2" pinPosition={{ right: ["pin1", "pin2"] }} connections={{ pin1: "net.E", pin2: "net.F" }} />
      <resistor name="R3" connections={{ pin1: "U2.pin1" }} />
      <capacitor name="C2" connections={{ pin1: "R3.pin2" }} />

      <chip name="U3" pinPosition={{ right: ["pin1"], bottom: ["pin2"] }} connections={{ pin1: "net.G", pin2: "net.H" }} />
      <capacitor name="C3" connections={{ pin1: "U3.pin1" }} />
      <capacitor name="C4" connections={{ pin1: "U3.pin2" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
