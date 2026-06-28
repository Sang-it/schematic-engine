import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

test("double-connected passive renders to svg", () => {
  const svg = astToSchematicSvg(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2"] }} connections={{ pin1: "net.A", pin2: "net.B" }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1", pin2: "U1.pin2" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
