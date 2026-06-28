import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

test("inter-passive chain renders to svg", () => {
  const svg = astToSchematicSvg(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1"], top: ["pin2"] }} connections={{ pin1: "net.A", pin2: "net.B" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <capacitor name="C1" connections={{ pin1: "R1.pin2" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2", pin2: "C1.pin2" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
