import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// I2C bus: an MCU talks to a sensor over SDA/SCL, each line pulled up to 3V3.
const CIRCUIT = `
  <chip name="U1" pins={{ pin1: "SDA", pin2: "SCL", pin3: "VDD", pin4: "GND" }} connections={{ pin1: "net.SDA", pin2: "net.SCL", pin3: "net.3V3", pin4: "net.GND" }} />
  <chip name="U2" pins={{ pin1: "SDA", pin2: "SCL", pin3: "VDD", pin4: "GND" }} connections={{ pin1: "net.SDA", pin2: "net.SCL", pin3: "net.3V3", pin4: "net.GND" }} />
  <resistor name="R1" connections={{ pin1: "net.3V3", pin2: "net.SDA" }} />
  <resistor name="R2" connections={{ pin1: "net.3V3", pin2: "net.SCL" }} />
  <net name="SDA" />
  <net name="SCL" />
  <net name="3V3" />
  <net name="GND" />
`

test("i2c: MCU + sensor + two pull-up resistors", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips.map((c) => c.name)).toEqual(["U1", "U2"])
  expect(ir.resistors).toHaveLength(2)
})

test("i2c: both chips share SDA/SCL nets", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips[0].connections.pin1).toEqual({ kind: "net", name: "SDA" })
  expect(ir.chips[1].connections.pin1).toEqual({ kind: "net", name: "SDA" })
})

test("i2c: chips declare pin labels via `pins`", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips[0].pins).toEqual({
    pin1: "SDA",
    pin2: "SCL",
    pin3: "VDD",
    pin4: "GND",
  })
})

test("i2c: pull-ups tie SDA and SCL to 3V3", () => {
  const ir = parse(CIRCUIT)
  expect(ir.resistors[0].connections).toEqual({
    pin1: { kind: "net", name: "3V3" },
    pin2: { kind: "net", name: "SDA" },
  })
  expect(ir.resistors[1].connections.pin2).toEqual({ kind: "net", name: "SCL" })
})
