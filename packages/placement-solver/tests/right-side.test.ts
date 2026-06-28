import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

test("chip with multiple right-side passives renders to svg", () => {
  const svg = astToSchematicSvg(
    build(`
      <chip
        name="U1"
        pinPosition={{ right: ["pin1", "pin2", "pin3"] }}
        connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C" }}
      />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin3" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
