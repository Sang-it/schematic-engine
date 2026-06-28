import { expect, test } from "bun:test"
import { parse, build } from "../../src/index"

// Crystal oscillator: Y1 between the MCU's two XTAL pins, with matched load
// caps from each leg to ground. Connections expressed via explicit traces.
const CIRCUIT = `
  <chip name="U1" connections={{ pin1: "net.XTAL1", pin2: "net.XTAL2" }} />
  <chip name="Y1" connections={{ pin1: "net.XTAL1", pin2: "net.XTAL2" }} />
  <capacitor name="C1" connections={{ pin1: "net.XTAL1", pin2: "net.GND" }} />
  <capacitor name="C2" connections={{ pin1: "net.XTAL2", pin2: "net.GND" }} />
  <net name="XTAL1" />
  <net name="XTAL2" />
  <net name="GND" />
  <trace from="U1.pin1" to="Y1.pin1" />
  <trace from="U1.pin2" to="Y1.pin2" />
`

test("crystal: MCU + crystal + two load caps, two traces in IR", () => {
  const ir = parse(CIRCUIT)
  expect(ir.chips.map((c) => c.name)).toEqual(["U1", "Y1"])
  expect(ir.capacitors).toHaveLength(2)
  expect(ir.traces).toHaveLength(2)
})

test("crystal: desugar folds traces into pin connections, drops traces", () => {
  const ast = build(CIRCUIT)
  expect(ast).not.toHaveProperty("traces")
  expect(ast.chips[0].connections.pin1).toEqual({
    kind: "pin",
    component: "Y1",
    pin: "pin1",
  })
  expect(ast.chips[1].connections.pin2).toEqual({
    kind: "pin",
    component: "U1",
    pin: "pin2",
  })
})
