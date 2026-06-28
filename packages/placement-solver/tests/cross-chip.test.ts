import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

// Three chips joined by bridging passives: U1 -[RX]- U2 -[RY]- U3. The chips
// form one connected component and are laid out by connection direction, with
// the cross-chip wires drawn.
test("cross-connected chips render to svg", () => {
  const svg = astToSchematicSvg(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2"], left: ["pin3"] }} connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C" }} />
      <chip name="U2" pinPosition={{ right: ["pin1"], left: ["pin2"] }} connections={{ pin1: "net.D", pin2: "net.E" }} />
      <chip name="U3" pinPosition={{ left: ["pin1"] }} connections={{ pin1: "net.F" }} />
      <resistor name="RX" connections={{ pin1: "U1.pin1", pin2: "U2.pin2" }} />
      <resistor name="RY" connections={{ pin1: "U2.pin1", pin2: "U3.pin1" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin3" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
