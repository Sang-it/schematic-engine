import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToRoutedSvg } from "../src/index"
import "./helpers"

// Route a real multi-chip circuit (LDO -> MCU -> sensor, bridged by series
// resistors, each chip with a decoupling cap) and render the traces.
test("routed multi-chip schematic renders to svg", () => {
  const svg = astToRoutedSvg(
    build(`
      <chip name="U1" pinPosition={{ left: ["pin1"], right: ["pin2", "pin3"], bottom: ["pin4"] }} connections={{ pin1: "net.3V3", pin2: "net.SDA", pin3: "net.SCL", pin4: "net.GND" }} />
      <chip name="U2" pinPosition={{ left: ["pin1", "pin2"], right: ["pin3"], bottom: ["pin4"] }} connections={{ pin1: "net.SDA", pin2: "net.SCL", pin3: "net.3V3", pin4: "net.GND" }} />
      <chip name="U3" pinPosition={{ right: ["pin1"], left: ["pin2"], bottom: ["pin3"] }} connections={{ pin1: "net.3V3", pin2: "net.VIN", pin3: "net.GND" }} />
      <resistor name="RPWR" connections={{ pin1: "U1.pin1", pin2: "U3.pin1" }} />
      <resistor name="RSDA" connections={{ pin1: "U1.pin2", pin2: "U2.pin1" }} />
      <resistor name="RSCL" connections={{ pin1: "U1.pin3", pin2: "U2.pin2" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin4" }} />
      <capacitor name="C2" connections={{ pin1: "U2.pin4" }} />
      <capacitor name="C3" connections={{ pin1: "U3.pin3" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
