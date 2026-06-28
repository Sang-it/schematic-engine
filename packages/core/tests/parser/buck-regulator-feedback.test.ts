import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// Switching regulator with input/output caps and a feedback divider that
// sets VOUT. FB pin samples the divider midpoint.
//   U1: pin1=VIN pin2=GND pin3=SW pin4=FB pin5=VOUT
const CIRCUIT = `
  <chip name="U1" connections={{ pin1: "net.VIN", pin2: "net.GND", pin4: "net.FB", pin5: "net.VOUT" }} />
  <capacitor name="CIN" connections={{ pin1: "net.VIN", pin2: "net.GND" }} />
  <capacitor name="COUT" connections={{ pin1: "net.VOUT", pin2: "net.GND" }} />
  <resistor name="RFB1" connections={{ pin1: "net.VOUT", pin2: "net.FB" }} />
  <resistor name="RFB2" connections={{ pin1: "net.FB", pin2: "net.GND" }} />
  <net name="VIN" />
  <net name="VOUT" />
  <net name="FB" />
  <net name="GND" />
`

test("buck: regulator, input/output caps, feedback divider", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips).toHaveLength(1)
  expect(ir.capacitors.map((c) => c.name)).toEqual(["CIN", "COUT"])
  expect(ir.resistors.map((r) => r.name)).toEqual(["RFB1", "RFB2"])
})

test("buck: feedback divider midpoint reaches the FB pin", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors[0].connections.pin2).toEqual({ kind: "net", name: "FB" })
  expect(ir.resistors[1].connections.pin1).toEqual({ kind: "net", name: "FB" })
  expect(ir.chips[0].connections.pin4).toEqual({ kind: "net", name: "FB" })
})
