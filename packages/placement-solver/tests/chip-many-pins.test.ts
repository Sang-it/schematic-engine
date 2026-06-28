import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg } from "../src/index"
import "./helpers"

test("standalone chip with many pins renders with pin numbers", () => {
  const conns = Array.from(
    { length: 8 },
    (_, i) => `pin${i + 1}: "net.N${i + 1}"`,
  ).join(", ")
  const svg = astToSchematicSvg(
    build(`<chip name="U1" connections={{ ${conns} }} />`),
  )
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
