import { expect, test } from "bun:test"
import { build, parse } from "../src/index"

test("default schematic sizes per component type", () => {
  const ir = parse(`
    <chip name="U1" connections={{ pin1: "net.A" }} />
    <resistor name="R1" connections={{ pin1: "net.A", pin2: "net.B" }} />
    <capacitor name="C1" connections={{ pin1: "net.A", pin2: "net.B" }} />
  `)
  expect(ir.chips[0].schematicSize).toEqual({
    schematicWidth: 4,
    schematicHeight: 8,
  })
  expect(ir.resistors[0].schematicSize).toEqual({
    schematicWidth: 1,
    schematicHeight: 0.5,
  })
  expect(ir.capacitors[0].schematicSize).toEqual({
    schematicWidth: 1,
    schematicHeight: 0.5,
  })
})

test("schematicWidth/schematicHeight attributes override the default", () => {
  const ir = parse(
    `<chip name="U1" schematicWidth="3" schematicHeight={6} connections={{ pin1: "net.A" }} />`,
  )
  expect(ir.chips[0].schematicSize).toEqual({
    schematicWidth: 3,
    schematicHeight: 6,
  })
})

test("schematicSize survives desugar into the final AST", () => {
  const ast = build(`<resistor name="R1" connections={{ pin1: "net.A" }} />`)
  expect(ast.resistors[0].schematicSize).toEqual({
    schematicWidth: 1,
    schematicHeight: 0.5,
  })
})
