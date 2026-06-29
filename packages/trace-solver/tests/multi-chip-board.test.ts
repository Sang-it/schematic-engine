import { build } from "@schematic-engine/core"
import { solveSchematic } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { segmentsOverlap } from "../src/geom"
import { astToRoutedSvg, solveTraces } from "../src/index"
import "./helpers"

// A small but complex three-chip board, exercising the multi-chip path of the
// solver end to end: an MCU (U1), a regulator (U2) and a sensor (U3) wired to
// each other, plus resistors and capacitors covering every connection shape:
//  - net pull-ups (resistor: one pin to a net, one to a chip pin),
//  - a lone single chip-pin resistor (R3) with another passive hung off its
//    free pin (R5, inter-passive),
//  - same-side double-connected passives (R4 on U2; the decoupling caps),
//  - a single chip-pin capacitor (C4),
//  - cross-chip pin-to-pin traces that drive the 2D grid placement.
// Every chip uses only its left and right sides (no top/bottom pins).
const U1_PINS = {
  top: [],
  left: ["pin1", "pin2", "pin3", "pin4", "pin5", "pin6", "pin7", "pin8"],
  right: [
    "pin9",
    "pin10",
    "pin11",
    "pin12",
    "pin13",
    "pin14",
    "pin15",
    "pin16",
  ],
  bottom: [],
}
const U2_PINS = {
  top: [],
  left: ["pin1", "pin2", "pin3", "pin4"],
  right: ["pin5", "pin6", "pin7", "pin8"],
  bottom: [],
}
const U3_PINS = {
  top: [],
  left: ["pin1", "pin2", "pin3", "pin4"],
  right: ["pin5", "pin6", "pin7", "pin8"],
  bottom: [],
}
const pos = (sides: Record<string, string[]>) =>
  `{ top: ${JSON.stringify(sides.top)}, left: ${JSON.stringify(sides.left)}, right: ${JSON.stringify(sides.right)}, bottom: ${JSON.stringify(sides.bottom)} }`

const CIRCUIT = `
  <chip
    name="U1"
    pinPosition={${pos(U1_PINS)}}
    connections={{ pin13: "net.V3_3", pin14: "net.GND" }}
  />
  <chip
    name="U2"
    pinPosition={${pos(U2_PINS)}}
    connections={{ pin7: "net.V5", pin8: "net.GND" }}
  />
  <chip
    name="U3"
    pinPosition={${pos(U3_PINS)}}
    connections={{ pin7: "net.V3_3", pin8: "net.GND" }}
  />

  <resistor name="R1" connections={{ pin1: "net.V3_3", pin2: "U1.pin5" }} />
  <resistor name="R2" connections={{ pin1: "net.V3_3", pin2: "U1.pin6" }} />
  <resistor name="R3" connections={{ pin1: "U1.pin7" }} />
  <resistor name="R4" connections={{ pin1: "U2.pin3", pin2: "U2.pin4" }} />
  <resistor name="R5" connections={{ pin1: "R3.pin2" }} />

  <capacitor name="C1" connections={{ pin1: "U1.pin9", pin2: "U1.pin10" }} />
  <capacitor name="C2" connections={{ pin1: "U2.pin5", pin2: "U2.pin6" }} />
  <capacitor name="C3" connections={{ pin1: "U3.pin5", pin2: "U3.pin6" }} />
  <capacitor name="C4" connections={{ pin1: "U3.pin4" }} />

  <trace from="U1.pin1" to="U2.pin1" />
  <trace from="U1.pin2" to="U3.pin1" />
  <trace from="U1.pin3" to="U3.pin2" />
  <trace from="U2.pin2" to="U3.pin3" />
`

test("a three-chip board places, routes across chips, and renders", () => {
  const ast = build(CIRCUIT)
  const placement = solveSchematic(ast)
  const names = placement.blocks.map((b) => b.name)

  // Every chip and passive is placed.
  for (const n of ["U1", "U2", "U3"]) expect(names).toContain(n)
  for (const n of ["R1", "R2", "R3", "R4", "R5"]) expect(names).toContain(n)
  for (const n of ["C1", "C2", "C3", "C4"]) expect(names).toContain(n)

  const routed = solveTraces(placement)
  expect(routed.traces.length).toBeGreaterThan(0)

  // U1 and U3 are non-adjacent in the row (U2 sits between them), so their two
  // pin-to-pin connections are NOT routed — each falls back to a pair of net
  // labels sharing a number. The adjacent pairs (U1<->U2, U2<->U3) still route.
  expect(routed.labels.length).toBeGreaterThan(0)
  // Labels come in matched pairs: every number appears exactly twice.
  const counts = new Map<string, number>()
  for (const l of routed.labels)
    counts.set(l.label, (counts.get(l.label) ?? 0) + 1)
  for (const n of counts.values()) expect(n).toBe(2)

  // Every routed segment is axis-aligned (Manhattan).
  for (const t of routed.traces) {
    for (let i = 1; i < t.points.length; i++) {
      const p = t.points[i - 1]
      const q = t.points[i]
      expect(p.x === q.x || p.y === q.y).toBe(true)
    }
  }

  // The cross-chip connections lay the chips out together (not in isolated
  // rows): the three chips sit at distinct positions.
  const u1 = placement.blocks.find((b) => b.name === "U1")!
  const u2 = placement.blocks.find((b) => b.name === "U2")!
  const u3 = placement.blocks.find((b) => b.name === "U3")!
  expect(u1.x !== u2.x || u1.y !== u2.y).toBe(true)
  expect(u2.x !== u3.x || u2.y !== u3.y).toBe(true)

  // No trace connects U1 directly to U3 — that pair is label-only.
  const nameAt = new Map<string, string>()
  for (const b of placement.blocks)
    for (const p of b.pins) nameAt.set(`${p.x},${p.y}`, b.name)
  for (const t of routed.traces) {
    const a = nameAt.get(`${t.points[0].x},${t.points[0].y}`)
    const z = nameAt.get(
      `${t.points[t.points.length - 1].x},${t.points[t.points.length - 1].y}`,
    )
    const pair = [a, z].sort().join("-")
    expect(pair).not.toBe("U1-U3")
  }

  // Overlap invariant: two traces may run collinearly on top of each other only
  // if they share an endpoint (a common connection). Otherwise no overlap.
  const segs = (t: { points: { x: number; y: number }[] }) =>
    t.points.slice(1).map((p, i) => ({ a: t.points[i], b: p }))
  const ends = (t: { points: { x: number; y: number }[] }) =>
    new Set([
      `${t.points[0].x},${t.points[0].y}`,
      `${t.points.at(-1)!.x},${t.points.at(-1)!.y}`,
    ])
  for (let i = 0; i < routed.traces.length; i++) {
    for (let j = i + 1; j < routed.traces.length; j++) {
      const shared = [...ends(routed.traces[i])].some((k) =>
        ends(routed.traces[j]).has(k),
      )
      if (shared) continue
      for (const s1 of segs(routed.traces[i]))
        for (const s2 of segs(routed.traces[j]))
          expect(segmentsOverlap(s1, s2)).toBe(false)
    }
  }

  // Every chip pin sits on the left or right side only.
  for (const chip of [u1, u2, u3])
    for (const pin of chip.pins)
      expect(pin.side === "left" || pin.side === "right").toBe(true)

  expect(astToRoutedSvg(ast)).toMatchSchematicSvg(import.meta.path)
})
