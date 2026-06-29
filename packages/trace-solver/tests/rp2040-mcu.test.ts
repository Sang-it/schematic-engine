import { build } from "@schematic-engine/core"
import { solveSchematic } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { astToRoutedSvg } from "../src/index"
import "./helpers"

// The RP2040 microcontroller section from core's rp2040 project, expressed in
// the supported subset: a 57-pin chip with a 4-side pin arrangement + labels,
// five resistors, and traces to nets / resistor pins.
const PIN_LABELS: Record<string, string> = {
  pin1: "IOVDD_1",
  pin2: "GPIO0",
  pin3: "GPIO1",
  pin4: "GPIO2",
  pin5: "GPIO3",
  pin6: "GPIO4",
  pin7: "GPIO5",
  pin8: "GPIO6",
  pin9: "GPIO7",
  pin10: "IOVDD_2",
  pin11: "GPIO8",
  pin12: "GPIO9",
  pin13: "GPIO10",
  pin14: "GPIO11",
  pin15: "GPIO12",
  pin16: "GPIO13",
  pin17: "GPIO14",
  pin18: "GPIO15",
  pin19: "TESTEN",
  pin20: "XIN",
  pin21: "XOUT",
  pin24: "SWCLK",
  pin25: "SWDIO",
  pin26: "RUN",
  pin27: "GPIO16",
  pin28: "GPIO17",
  pin29: "GPIO18",
  pin30: "GPIO19",
  pin31: "GPIO20",
  pin32: "GPIO21",
  pin33: "IOVDD_4",
  pin34: "GPIO22",
  pin35: "GPIO23",
  pin36: "GPIO24",
  pin37: "GPIO25",
  pin38: "GPIO26_ADC0",
  pin39: "GPIO27_ADC1",
  pin40: "GPIO28_ADC2",
  pin41: "GPIO29_ADC3",
  pin42: "IOVDD_5",
  pin43: "ADC_AVDD",
  pin44: "VREG_VIN",
  pin45: "VREG_VOUT",
  pin46: "USB_DM",
  pin47: "USB_DP",
  pin48: "USB_VDD",
  pin49: "IOVDD_6",
  pin50: "DVDD",
  pin51: "QSPI_SD3",
  pin52: "QSPI_SCLK",
  pin53: "QSPI_SD0",
  pin54: "QSPI_SD2",
  pin55: "QSPI_SD1",
  pin56: "QSPI_SS",
  pin57: "GND",
}
// Balance the chip: split all pins evenly across the four sides.
const ALL_PINS = Object.keys(PIN_LABELS).sort(
  (a, b) => Number(a.slice(3)) - Number(b.slice(3)),
)
const PER_SIDE = Math.ceil(ALL_PINS.length / 4)
const SIDE_PINS = {
  top: ALL_PINS.slice(0, PER_SIDE),
  left: ALL_PINS.slice(PER_SIDE, 2 * PER_SIDE),
  right: ALL_PINS.slice(2 * PER_SIDE, 3 * PER_SIDE),
  bottom: ALL_PINS.slice(3 * PER_SIDE),
}
const pinPosition = `{ top: ${JSON.stringify(SIDE_PINS.top)}, left: ${JSON.stringify(SIDE_PINS.left)}, right: ${JSON.stringify(SIDE_PINS.right)}, bottom: ${JSON.stringify(SIDE_PINS.bottom)} }`
const pins = `{ ${Object.entries(PIN_LABELS)
  .map(([pin, label]) => `${pin}: "${label}"`)
  .join(", ")} }`

const CIRCUIT = `
  <chip
    name="U3"
    pins={${pins}}
    pinPosition={${pinPosition}}
    connections={{ pin42: "net.V3_3", pin48: "net.V3_3", pin43: "net.V3_3", pin44: "net.V3_3", pin45: "net.V1", pin50: "net.V1",
pin2: "net.V1", pin3: "net.V1"
    }}
  />
  <resistor name="R4" />
  <resistor name="R5" />
  <resistor name="R6" />
  <resistor name="R7" />
  <resistor name="R8" />

  <trace from="U3.pin47" to="R6.pin1" />
  <trace from="U3.pin46" to="R7.pin1" />
  <trace from="U3.pin27" to="R8.pin1" />
  <trace from="U3.pin28" to="R8.pin2" />
  <trace from="U3.pin25" to="R5.pin2" />
  <trace from="U3.pin26" to="R4.pin2" />
  <trace from="R4.pin1" to="net.V3_3" />
  <trace from="R5.pin1" to="net.V3_3" />
  <trace from="U3.pin19" to="net.GND" />
  <trace from="U3.pin57" to="net.GND" />

  <capacitor name="CTOP" connections={{ pin1: "U3.${SIDE_PINS.top[0]}", pin2: "U3.${SIDE_PINS.top[1]}" }} />
  <capacitor name="CLEFT" connections={{ pin1: "U3.${SIDE_PINS.left[0]}", pin2: "U3.${SIDE_PINS.left[1]}" }} />
  <capacitor name="CRIGHT" connections={{ pin1: "U3.${SIDE_PINS.right[0]}", pin2: "U3.${SIDE_PINS.right[1]}" }} />
  <capacitor name="CBOT" connections={{ pin1: "U3.${SIDE_PINS.bottom[0]}", pin2: "U3.${SIDE_PINS.bottom[1]}" }} />

  <resistor name="RC1" connections={{ pin1: "CRIGHT.pin1" }} />
  <resistor name="RC2" connections={{ pin1: "CRIGHT.pin2" }} />

  <resistor name="R33" connections={{ pin1: "U3.pin33" }} />
  <resistor name="R34" connections={{ pin1: "U3.pin34" }} />
  <resistor name="R35" connections={{ pin1: "U3.pin35" }} />
`

test("rp2040 microcontroller section places, routes, and renders", () => {
  const ast = build(CIRCUIT)
  const { blocks } = solveSchematic(ast)

  // The chip plus all five resistors are placed.
  const names = blocks.map((b) => b.name)
  expect(names).toContain("U3")
  for (const r of ["R4", "R5", "R6", "R7", "R8"]) expect(names).toContain(r)
  // A same-side double-connected capacitor on each of the four sides.
  for (const c of ["CTOP", "CLEFT", "CRIGHT", "CBOT"])
    expect(names).toContain(c)
  // Resistors hung off CRIGHT's two pins (passive-to-passive).
  for (const r of ["RC1", "RC2"]) expect(names).toContain(r)
  // One resistor each on chip pins 33/34/35.
  for (const r of ["R33", "R34", "R35"]) expect(names).toContain(r)

  // Pins are balanced across all four sides (within one of each other).
  const u3 = blocks.find((b) => b.name === "U3")!
  const count = (side: string) => u3.pins.filter((p) => p.side === side).length
  const counts = ["top", "left", "right", "bottom"].map(count)
  expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  expect(counts.reduce((a, b) => a + b, 0)).toBe(u3.pins.length)

  expect(astToRoutedSvg(ast)).toMatchSchematicSvg(import.meta.path)
})
