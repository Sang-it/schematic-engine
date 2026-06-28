import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// Classic 555 astable oscillator. R1 from VCC to DISCHARGE, R2 between
// DISCHARGE and THRESHOLD/TRIGGER, timing cap from THRESHOLD to GND.
//   U1: pin2=TRIGGER pin6=THRESHOLD pin7=DISCHARGE pin8=VCC pin1=GND
const CIRCUIT = `
  <chip name="U1" connections={{ pin1: "net.GND", pin2: "net.THRESH", pin6: "net.THRESH", pin7: "net.DISCH", pin8: "net.VCC" }} />
  <resistor name="R1" connections={{ pin1: "net.VCC", pin2: "net.DISCH" }} />
  <resistor name="R2" connections={{ pin1: "net.DISCH", pin2: "net.THRESH" }} />
  <capacitor name="C1" connections={{ pin1: "net.THRESH", pin2: "net.GND" }} />
  <net name="VCC" />
  <net name="GND" />
  <net name="DISCH" />
  <net name="THRESH" />
`

test("555 astable: one timer chip, two resistors, one cap", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips).toHaveLength(1)
  expect(ir.resistors).toHaveLength(2)
  expect(ir.capacitors).toHaveLength(1)
})

test("555 astable: trigger and threshold tied together", () => {
  const ir = parse(CIRCUIT)
  const u1 = ir.chips[0]
  expect(u1.connections.pin2).toEqual({ kind: "net", name: "THRESH" })
  expect(u1.connections.pin6).toEqual({ kind: "net", name: "THRESH" })
})

test("555 astable: timing cap from THRESH to GND", () => {
  const ir = parse(CIRCUIT)
  expect(ir.capacitors[0].connections).toEqual({
    pin1: { kind: "net", name: "THRESH" },
    pin2: { kind: "net", name: "GND" },
  })
})
