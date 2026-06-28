import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { placeSequentially } from "../src/index"
import "./helpers"

test("placeSequentially lays blocks left-to-right (utility)", () => {
  const ast = build(`
    <chip name="U1" connections={{ pin1: "net.A" }} />
    <resistor name="R1" connections={{ pin1: "net.A", pin2: "net.B" }} />
  `)
  const blocks = placeSequentially(ast)
  expect(blocks.map((b) => b.x)).toEqual([0, 5])
})
