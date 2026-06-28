import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

// 10 pins on the right edge with single passives on adjacent pins: the spacing
// is floored to fit them and the chip box grows taller.
test("dense-pin chip with floored spacing renders to svg", () => {
  const conns = Array.from(
    { length: 10 },
    (_, i) => `pin${i + 1}: "net.N${i + 1}"`,
  ).join(", ")
  const svg = astToSchematicSvg(
    build(`
      <chip name="U1" pinPosition={{ right: ["pin1", "pin2", "pin3", "pin4", "pin5", "pin6", "pin7", "pin8", "pin9", "pin10"] }} connections={{ ${conns} }} />
      <resistor name="R1" connections={{ pin1: "U1.pin1" }} />
      <resistor name="R2" connections={{ pin1: "U1.pin2" }} />
      <capacitor name="C1" connections={{ pin1: "U1.pin5" }} />
    `),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
