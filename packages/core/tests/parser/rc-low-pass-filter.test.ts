import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// Passive RC low-pass filter: series resistor into a shunt capacitor.
//   IN --[R1]--+--[C1]--> GND
//              |
//             OUT
const CIRCUIT = `
  <resistor name="R1" connections={{ pin1: "net.IN", pin2: "net.OUT" }} />
  <capacitor name="C1" connections={{ pin1: "net.OUT", pin2: "net.GND" }} />
  <net name="IN" />
  <net name="OUT" />
  <net name="GND" />
`

test("rc low-pass: one resistor, one capacitor, three nets", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors).toHaveLength(1)
  expect(ir.capacitors).toHaveLength(1)
  expect(ir.nets.map((n) => n.name)).toEqual(["IN", "OUT", "GND"])
})

test("rc low-pass: R1 and C1 share the OUT node", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors[0].connections.pin2).toEqual({ kind: "net", name: "OUT" })
  expect(ir.capacitors[0].connections.pin1).toEqual({
    kind: "net",
    name: "OUT",
  })
})
