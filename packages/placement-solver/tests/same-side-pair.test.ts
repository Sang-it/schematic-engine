import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

// A chip with many right-side pins plus two same-side bridging capacitors. The
// bridged pin pairs are pulled adjacent, spaced to fit, and the box grows.
test("same-side pair layout renders to svg", () => {
  const svg = astToSchematicSvg(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2", "pin3", "pin4", "pin5", "pin6"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D", pin5: "net.E", pin6: "net.F" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin1", pin2: "U1.pin5" }} />
      <capacitor name="C2" connections={{ pin1: "U1.pin3", pin2: "U1.pin6" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin2" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
