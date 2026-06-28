import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// MCU reset: pull-up resistor to VCC plus an RC delay cap to GND on /RESET.
const CIRCUIT = `
  <chip name="U1" connections={{ pin1: "net.RESET", pin2: "net.VCC", pin3: "net.GND" }} />
  <resistor name="R1" connections={{ pin1: "net.VCC", pin2: "net.RESET" }} />
  <capacitor name="C1" connections={{ pin1: "net.RESET", pin2: "net.GND" }} />
  <net name="RESET" />
  <net name="VCC" />
  <net name="GND" />
`

test("reset: pull-up resistor ties RESET to VCC", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors[0].connections).toEqual({
    pin1: { kind: "net", name: "VCC" },
    pin2: { kind: "net", name: "RESET" },
  })
})

test("reset: delay cap from RESET to GND, chip sees RESET on pin1", () => {
  const ir = parse(CIRCUIT)
  expect(ir.capacitors[0].connections.pin1).toEqual({
    kind: "net",
    name: "RESET",
  })
  expect(ir.chips[0].connections.pin1).toEqual({ kind: "net", name: "RESET" })
})
