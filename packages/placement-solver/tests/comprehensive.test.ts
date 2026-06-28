import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { astToSchematicSvg, solveSchematic } from "../src/index"
import "./helpers"

// One circuit that exercises everything currently supported:
//  - a chip with explicit pinPosition on all four sides + pin labels
//  - net connections and direct pin connections
//  - single-connection chip passives on every side (rotation per side)
//  - a same-side double (vertical) and a top/bottom double (horizontal)
//  - a collision (two passives on the same chip pin) resolved on x
//  - a chip+passive double, a passive->passive single, a passive-passive double
//  - resistors and capacitors, with placement precedence + deferral
const CIRCUIT = `
  <chip
    name="U1"
    pins={{ pin1: "VDD", pin2: "PA2", pin3: "NRST", pin4: "BOOT0", pin5: "PA0", pin6: "PA1", pin7: "VSS", pin8: "PA3" }}
    pinPosition={{ top: ["pin1", "pin2"], left: ["pin3", "pin4"], right: ["pin5", "pin6"], bottom: ["pin7", "pin8"] }}
    connections={{ pin1: "net.VDD", pin2: "net.PA2", pin3: "net.NRST", pin4: "net.BOOT0", pin5: "net.PA0", pin6: "net.PA1", pin7: "net.VSS", pin8: "net.PA3" }}
  />

  <resistor name="R1" connections={{ pin1: "U1.pin3" }} />
  <resistor name="R2" connections={{ pin1: "U1.pin5" }} />
  <resistor name="R3" connections={{ pin1: "U1.pin5" }} />
  <resistor name="R4" connections={{ pin1: "U1.pin5", pin2: "U1.pin6" }} />
  <resistor name="R5" connections={{ pin1: "U1.pin4", pin2: "R1.pin2" }} />

  <capacitor name="C1" connections={{ pin1: "U1.pin1" }} />
  <capacitor name="C2" connections={{ pin1: "U1.pin7" }} />
  <capacitor name="C3" connections={{ pin1: "U1.pin2", pin2: "U1.pin8" }} />
  <capacitor name="C4" connections={{ pin1: "R5.pin2" }} />
  <capacitor name="C5" connections={{ pin1: "R2.pin2", pin2: "C1.pin2" }} />
  <capacitor name="C6" connections={{ pin1: "U1.pin3", pin2: "U1.pin4" }} />
  <capacitor name="C7" connections={{ pin1: "U1.pin5", pin2: "U1.pin6" }} />
`

test("comprehensive: chip, resistors, capacitors, every connection shape", () => {
  const { blocks, connections } = solveSchematic(build(CIRCUIT))

  // 1 chip + 12 passives, all placed (no bare leftovers).
  expect(blocks).toHaveLength(13)
  for (const b of blocks) expect(b.pins.length).toBeGreaterThan(0)

  // 6 single (R1,R2,R3,C1,C2,C4) + 6 double x2 (R4,C3,R5,C5,C6,C7) = 18 wires.
  expect(connections).toHaveLength(18)

  // Collision: R2 and R3 share chip pin5 -> same row, shifted on x with a gap.
  const r2 = blocks.find((b) => b.name === "R2")!
  const r3 = blocks.find((b) => b.name === "R3")!
  expect(r2.y).toBe(r3.y)
  const [lo, hi] = r2.x < r3.x ? [r2, r3] : [r3, r2]
  expect(hi.x - (lo.x + lo.width)).toBeGreaterThanOrEqual(1)

  // R4 (same-side double) runs vertical; C3 (top/bottom double) runs horizontal.
  const r4 = blocks.find((b) => b.name === "R4")!
  const c3 = blocks.find((b) => b.name === "C3")!
  expect(r4.width).toBeLessThan(r4.height)
  expect(c3.width).toBeGreaterThan(c3.height)

  // C6 is a same-side (left) double -> vertical, centred between pin3 and pin4.
  const c6 = blocks.find((b) => b.name === "C6")!
  expect(c6.width).toBeLessThan(c6.height)
  const u1 = blocks[0]
  const leftMid =
    (u1.pins.find((p) => p.pin === "pin3")!.y +
      u1.pins.find((p) => p.pin === "pin4")!.y) /
    2
  expect(c6.y + c6.height / 2).toBeCloseTo(leftMid)

  // C7 connects the SAME pins as R4 -> pushed clear of R4's reserved channel.
  const c7 = blocks.find((b) => b.name === "C7")!
  expect(c7.x).toBeGreaterThanOrEqual(r4.x + r4.width)

  // No two placed blocks overlap.
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

  // Every wire endpoint lands on an actual pin coordinate.
  const pinPts = new Set(
    blocks.flatMap((b) => b.pins.map((p) => `${p.x},${p.y}`)),
  )
  for (const c of connections) {
    expect(pinPts.has(`${c.x1},${c.y1}`)).toBe(true)
    expect(pinPts.has(`${c.x2},${c.y2}`)).toBe(true)
  }

  expect(astToSchematicSvg(build(CIRCUIT))).toMatchSchematicSvg(
    import.meta.path,
  )
})
