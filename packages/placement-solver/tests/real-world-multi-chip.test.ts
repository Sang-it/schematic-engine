import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg, solveSchematic } from "../src/index"
import "./helpers"

// Real-world-ish: an LDO feeds an MCU, which talks I2C to a sensor. The chips
// are bridged by series resistors (power feed + SDA/SCL), so they form one
// connected component laid out by direction: LDO -> MCU -> sensor. Each chip
// also has its own decoupling capacitor.
const CIRCUIT = `
  <chip name="U1"
    pins={{ pin1: "VDD", pin2: "SDA", pin3: "SCL", pin4: "GND" }}
    pinPosition={{ left: ["pin1"], right: ["pin2", "pin3"], bottom: ["pin4"] }}
    connections={{ pin1: "net.3V3", pin2: "net.SDA", pin3: "net.SCL", pin4: "net.GND" }}
  />
  <chip name="U2"
    pins={{ pin1: "SDA", pin2: "SCL", pin3: "VDD", pin4: "GND" }}
    pinPosition={{ left: ["pin1", "pin2"], right: ["pin3"], bottom: ["pin4"] }}
    connections={{ pin1: "net.SDA", pin2: "net.SCL", pin3: "net.3V3", pin4: "net.GND" }}
  />
  <chip name="U3"
    pins={{ pin1: "VOUT", pin2: "VIN", pin3: "GND" }}
    pinPosition={{ right: ["pin1"], left: ["pin2"], bottom: ["pin3"] }}
    connections={{ pin1: "net.3V3", pin2: "net.VIN", pin3: "net.GND" }}
  />

  <resistor name="RPWR" connections={{ pin1: "U1.pin1", pin2: "U3.pin1" }} />
  <resistor name="RSDA" connections={{ pin1: "U1.pin2", pin2: "U2.pin1" }} />
  <resistor name="RSCL" connections={{ pin1: "U1.pin3", pin2: "U2.pin2" }} />

  <capacitor name="C1" connections={{ pin1: "U1.pin4" }} />
  <capacitor name="C2" connections={{ pin1: "U2.pin4" }} />
  <capacitor name="C3" connections={{ pin1: "U3.pin3" }} />
  <capacitor name="CIN" connections={{ pin1: "U3.pin2" }} />
`

test("real-world multi-chip (LDO -> MCU -> I2C sensor) renders to svg", () => {
  const { blocks } = solveSchematic(build(CIRCUIT))
  const u1 = blocks.find((b) => b.name === "U1")!
  const u2 = blocks.find((b) => b.name === "U2")!
  const u3 = blocks.find((b) => b.name === "U3")!

  // Direction chain: LDO (U3) left of MCU (U1) left of sensor (U2).
  expect(u3.x).toBeLessThan(u1.x)
  expect(u1.x).toBeLessThan(u2.x)

  // Every component placed (3 chips + 3 bridges + 4 caps = 10 blocks).
  expect(blocks).toHaveLength(10)

  expect(astToSchematicSvg(build(CIRCUIT))).toMatchSchematicSvg(
    import.meta.path,
  )
})
