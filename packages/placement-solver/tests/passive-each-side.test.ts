import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import { CHIP_4_SIDES } from "./helpers"

test("chip with a passive on every side renders to svg", () => {
  const svg = astToSchematicSvg(
    build(`
      ${CHIP_4_SIDES}
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin3" }} />
      <capacitor name="C2" connections={{ pin1: "U1.pin4" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
