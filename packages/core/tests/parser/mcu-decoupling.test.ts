import { expect, test } from "bun:test"
import { parse } from "../../src/index"

// MCU power rail with bulk + per-pin decoupling capacitors, all VCC->GND.
const CIRCUIT = `
  <chip name="U1" connections={{ pin1: "net.VCC", pin2: "net.VCC", pin3: "net.GND", pin4: "net.GND" }} />
  <capacitor name="C1" connections={{ pin1: "net.VCC", pin2: "net.GND" }} />
  <capacitor name="C2" connections={{ pin1: "net.VCC", pin2: "net.GND" }} />
  <capacitor name="C3" connections={{ pin1: "net.VCC", pin2: "net.GND" }} />
  <net name="VCC" />
  <net name="GND" />
`

test("mcu decoupling: one chip, three bypass caps", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips).toHaveLength(1)
  expect(ir.capacitors.map((c) => c.name)).toEqual(["C1", "C2", "C3"])
})

test("mcu decoupling: every cap bridges VCC and GND", () => {
  const ir = parse(CIRCUIT)
  for (const cap of ir.capacitors) {
    expect(cap.connections.pin1).toEqual({ kind: "net", name: "VCC" })
    expect(cap.connections.pin2).toEqual({ kind: "net", name: "GND" })
  }
})
