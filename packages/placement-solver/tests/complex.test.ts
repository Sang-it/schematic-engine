import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg, solveSchematic } from "../src/index"
import "./helpers"

test("complex chip: 4 sides, mixed R/C, single + double connections", () => {
  const CIRCUIT = `
    <chip
      name="U1"
      pinPosition={{ top: ["pin1", "pin2"], left: ["pin3", "pin4"], right: ["pin5", "pin6"], bottom: ["pin7", "pin8"] }}
      connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D", pin5: "net.E", pin6: "net.F", pin7: "net.G", pin8: "net.H" }}
    />
    <resistor name="R1" connections={{ pin1: "U1.pin3" }} />
    <resistor name="R2" connections={{ pin1: "U1.pin5" }} />
    <capacitor name="C1" connections={{ pin1: "U1.pin1" }} />
    <capacitor name="C2" connections={{ pin2: "U1.pin7" }} />
    <resistor name="R3" connections={{ pin1: "U1.pin5", pin2: "U1.pin6" }} />
    <capacitor name="C3" connections={{ pin1: "U1.pin2", pin2: "U1.pin8" }} />
    <resistor name="R4" connections={{ pin1: "U1.pin5" }} />
  `
  const { blocks, connections } = solveSchematic(build(CIRCUIT))

  // 1 chip + 7 passives.
  expect(blocks).toHaveLength(8)
  // 5 single-connection passives (1 wire each) + 2 double (2 wires each) = 9.
  expect(connections).toHaveLength(9)

  // Collision: R2 and R4 both target the same chip pin -> shifted on x only.
  const r2 = blocks.find((b) => b.name === "R2")!
  const r4 = blocks.find((b) => b.name === "R4")!
  expect(r2.y).toBe(r4.y)
  expect(r2.x).not.toBe(r4.x)
  const [lo, hi] = r2.x < r4.x ? [r2, r4] : [r4, r2]
  expect(hi.x - (lo.x + lo.width)).toBeGreaterThanOrEqual(1)

  // Fuzz-style invariant: no two placed blocks overlap.
  const overlap = (a: (typeof blocks)[number], b: (typeof blocks)[number]) =>
    !(
      a.x + a.width <= b.x ||
      b.x + b.width <= a.x ||
      a.y + a.height <= b.y ||
      b.y + b.height <= a.y
    )
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      expect(
        overlap(blocks[i], blocks[j]),
        `${blocks[i].name} overlaps ${blocks[j].name}`,
      ).toBe(false)
    }
  }

  // Every wire endpoint coincides with an actual pin coordinate.
  const pinPts = new Set(
    blocks.flatMap((b) => b.pins.map((p) => `${p.x},${p.y}`)),
  )
  for (const c of connections) {
    expect(pinPts.has(`${c.x1},${c.y1}`)).toBe(true)
    expect(pinPts.has(`${c.x2},${c.y2}`)).toBe(true)
  }

  const svg = astToSchematicSvg(build(CIRCUIT))
  expect(svg).toMatchSchematicSvg(import.meta.path)
})
