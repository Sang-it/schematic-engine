import { expect, test } from "bun:test"
import { parse, build } from "../../src/index"

// Full microcontroller dev board (>=10 components): LDO regulator, MCU,
// crystal with load caps, input/output + decoupling caps, reset pull-up,
// and I2C pull-ups. Crystal legs wired with explicit traces.
const CIRCUIT = `
  <chip name="U1" pins={{ pin1: "VDD", pin2: "VSS", pin3: "NRST", pin4: "XTAL1", pin5: "XTAL2", pin6: "SDA", pin7: "SCL" }} connections={{ pin1: "net.3V3", pin2: "net.GND", pin3: "net.RESET", pin4: "net.XTAL1", pin5: "net.XTAL2", pin6: "net.SDA", pin7: "net.SCL" }} />
  <chip name="U2" connections={{ pin1: "net.VIN", pin2: "net.GND", pin3: "net.3V3" }} />
  <chip name="Y1" connections={{ pin1: "net.XTAL1", pin2: "net.XTAL2" }} />
  <capacitor name="CIN" connections={{ pin1: "net.VIN", pin2: "net.GND" }} />
  <capacitor name="COUT" connections={{ pin1: "net.3V3", pin2: "net.GND" }} />
  <capacitor name="C1" connections={{ pin1: "net.3V3", pin2: "net.GND" }} />
  <capacitor name="CL1" connections={{ pin1: "Y1.pin1", pin2: "net.GND" }} />
  <capacitor name="CL2" connections={{ pin1: "Y1.pin2", pin2: "net.GND" }} />
  <resistor name="RRST" connections={{ pin1: "net.3V3", pin2: "net.RESET" }} />
  <resistor name="RSDA" connections={{ pin1: "net.3V3", pin2: "net.SDA" }} />
  <resistor name="RSCL" connections={{ pin1: "net.3V3", pin2: "net.SCL" }} />
  <net name="VIN" />
  <net name="3V3" />
  <net name="GND" />
  <net name="RESET" />
  <net name="XTAL1" />
  <net name="XTAL2" />
  <net name="SDA" />
  <net name="SCL" />
  <trace from="U1.pin4" to="Y1.pin1" />
  <trace from="U1.pin5" to="Y1.pin2" />
`

test("dev board: at least 10 components total", () => {
  const ir = parse(CIRCUIT)
  const total = ir.chips.length + ir.resistors.length + ir.capacitors.length
  expect(total).toBeGreaterThanOrEqual(10)
  expect(ir.chips).toHaveLength(3)
  expect(ir.capacitors).toHaveLength(5)
  expect(ir.resistors).toHaveLength(3)
})

test("dev board: 8 nets and 2 crystal traces parsed", () => {
  const ir = parse(CIRCUIT)
  expect(ir.nets).toHaveLength(8)
  expect(ir.traces).toHaveLength(2)
})

test("dev board: LDO output and MCU rail meet on 3V3", () => {
  const ir = parse(CIRCUIT)
  const u2 = ir.chips.find((c) => c.name === "U2")!
  expect(u2.connections.pin3).toEqual({ kind: "net", name: "3V3" })
  const u1 = ir.chips.find((c) => c.name === "U1")!
  expect(u1.connections.pin1).toEqual({ kind: "net", name: "3V3" })
})

test("dev board: MCU declares pin labels, load caps wire directly to crystal", () => {
  const ir = parse(CIRCUIT)
  const u1 = ir.chips.find((c) => c.name === "U1")!
  expect(u1.pins.pin3).toBe("NRST")
  expect(u1.pins.pin4).toBe("XTAL1")
  const cl1 = ir.capacitors.find((c) => c.name === "CL1")!
  expect(cl1.connections.pin1).toEqual({
    kind: "pin",
    component: "Y1",
    pin: "pin1",
  })
})

test("dev board: desugar wires MCU XTAL pins to the crystal", () => {
  const ast = build(CIRCUIT)
  expect(ast).not.toHaveProperty("traces")
  const u1 = ast.chips.find((c) => c.name === "U1")!
  expect(u1.connections.pin4).toEqual({
    kind: "pin",
    component: "Y1",
    pin: "pin1",
  })
  const y1 = ast.chips.find((c) => c.name === "Y1")!
  expect(y1.connections.pin2).toEqual({
    kind: "pin",
    component: "U1",
    pin: "pin5",
  })
})
