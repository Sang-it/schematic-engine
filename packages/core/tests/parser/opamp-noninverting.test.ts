import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// Non-inverting op-amp gain stage, wired with DIRECT pin-to-pin connections
// (no intermediate nets for the feedback loop). RF bridges OUT and IN-, RG
// hangs IN- to GND. Pin labels declared via `pins`.
//   U1: pin1=IN+ pin2=IN- pin3=OUT pin4=VEE pin5=VCC
const CIRCUIT = `
  <chip
    name="U1"
    pins={{ pin1: "INP", pin2: "INN", pin3: "OUT", pin4: "VEE", pin5: "VCC" }}
    connections={{ pin1: "net.SIG", pin2: "RF.pin2", pin3: "RF.pin1", pin4: "net.VEE", pin5: "net.VCC" }}
  />
  <resistor name="RF" connections={{ pin1: "U1.pin3", pin2: "U1.pin2" }} />
  <resistor name="RG" connections={{ pin1: "U1.pin2", pin2: "net.GND" }} />
  <net name="SIG" />
  <net name="VCC" />
  <net name="VEE" />
  <net name="GND" />
`

test("non-inverting amp: op-amp with declared pin labels", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips[0].pins).toEqual({
    pin1: "INP",
    pin2: "INN",
    pin3: "OUT",
    pin4: "VEE",
    pin5: "VCC",
  })
})

test("non-inverting amp: feedback resistor wired directly to op-amp pins", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors[0].name).toBe("RF")
  expect(ir.resistors[0].connections.pin1).toEqual({
    kind: "pin",
    component: "U1",
    pin: "pin3",
  })
  expect(ir.resistors[0].connections.pin2).toEqual({
    kind: "pin",
    component: "U1",
    pin: "pin2",
  })
})

test("non-inverting amp: op-amp IN-/OUT reference the resistor pins directly", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips[0].connections.pin2).toEqual({
    kind: "pin",
    component: "RF",
    pin: "pin2",
  })
  expect(ir.chips[0].connections.pin3).toEqual({
    kind: "pin",
    component: "RF",
    pin: "pin1",
  })
})
