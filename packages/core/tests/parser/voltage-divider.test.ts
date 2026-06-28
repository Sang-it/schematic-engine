import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// Resistive voltage divider: VIN -> R1 -> VOUT -> R2 -> GND.
const CIRCUIT = `
  <resistor name="R1" connections={{ pin1: "net.VIN", pin2: "net.VOUT" }} />
  <resistor name="R2" connections={{ pin1: "net.VOUT", pin2: "net.GND" }} />
  <net name="VIN" />
  <net name="VOUT" />
  <net name="GND" />
`

test("voltage divider: two resistors in series", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors.map((r) => r.name)).toEqual(["R1", "R2"])
})

test("voltage divider: R1 and R2 meet at VOUT", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors[0].connections.pin2).toEqual({
    kind: "net",
    name: "VOUT",
  })
  expect(ir.resistors[1].connections.pin1).toEqual({
    kind: "net",
    name: "VOUT",
  })
})
