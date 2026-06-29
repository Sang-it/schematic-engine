import { build } from "@schematic-engine/core"
import { solveSchematic } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import {
  CLEARANCE,
  runsAlongEdge,
  segmentHitsRect,
  segmentsTooClose,
} from "../src/geom"
import { astToRoutedSvg, solveTraces } from "../src/index"
import "./helpers"

// A nine-chip board roughly modelled on a real MCU system: an MCU hub (U1) wired
// out to a PMIC, USB transceiver, flash, IMU, radio, ADC, LED driver and a header,
// plus a couple of peripheral-to-peripheral buses. Every chip gets a decoupling
// cap (same-side double), there are bypass caps and pull-up / series / inter-
// passive resistors, and power/ground nets. Built with a pin allocator so no pin
// is ever wired twice. The build is fully deterministic, so the snapshot is stable.

interface Chip {
  name: string
  left: string[]
  right: string[]
  li: number
  ri: number
}
function chip(name: string, n: number): Chip {
  const pins = Array.from({ length: n }, (_, i) => `pin${i + 1}`)
  const half = Math.ceil(n / 2)
  return {
    name,
    left: pins.slice(0, half),
    right: pins.slice(half),
    li: 0,
    ri: 0,
  }
}
/** Next free pin, balancing the two sides. */
function take(c: Chip): string {
  const leftRoom = c.li < c.left.length
  const rightRoom = c.ri < c.right.length
  if (!leftRoom && !rightRoom) throw new Error(`${c.name} out of pins`)
  if (leftRoom && (!rightRoom || c.li <= c.ri)) return c.left[c.li++]
  return c.right[c.ri++]
}
/** Two free pins on the same side (for a double-connected cap). */
function takePairSameSide(c: Chip): [string, string] {
  if (c.left.length - c.li >= 2) return [c.left[c.li++], c.left[c.li++]]
  if (c.right.length - c.ri >= 2) return [c.right[c.ri++], c.right[c.ri++]]
  throw new Error(`${c.name} no same-side pair`)
}

function buildCircuit(): string {
  const U1 = chip("U1", 16) // MCU hub
  const U2 = chip("U2", 8) // PMIC
  const U3 = chip("U3", 8) // USB
  const U4 = chip("U4", 8) // flash
  const U5 = chip("U5", 8) // IMU
  const U6 = chip("U6", 8) // radio
  const U7 = chip("U7", 8) // ADC
  const U8 = chip("U8", 8) // LED driver
  const U9 = chip("U9", 8) // header
  const chips = [U1, U2, U3, U4, U5, U6, U7, U8, U9]

  const passives: string[] = []
  const traces: string[] = []

  // A decoupling cap (same-side double) on every chip.
  chips.forEach((c, i) => {
    const [a, b] = takePairSameSide(c)
    passives.push(
      `<capacitor name="CD${i + 1}" connections={{ pin1: "${c.name}.${a}", pin2: "${c.name}.${b}" }} />`,
    )
  })

  // Power + ground net on each chip.
  const nets: Record<string, string> = {}
  for (const c of chips) {
    const g = take(c)
    const v = take(c)
    nets[c.name] = `connections={{ ${g}: "net.GND", ${v}: "net.V3_3" }}`
  }

  // Cross-chip buses: MCU to every peripheral, plus a few peripheral links.
  const link = (a: Chip, b: Chip) =>
    traces.push(
      `<trace from="${a.name}.${take(a)}" to="${b.name}.${take(b)}" />`,
    )
  link(U1, U2)
  link(U1, U3)
  link(U1, U4)
  link(U1, U5)
  link(U1, U6)
  link(U1, U7)
  link(U1, U8)
  link(U1, U9)
  link(U4, U6) // shared SPI bus
  link(U5, U7) // sensor -> ADC
  link(U2, U3) // power enable

  // Pull-up / series / inter-passive resistors and bypass caps.
  passives.push(
    `<resistor name="R1" connections={{ pin1: "net.V3_3", pin2: "U1.${take(U1)}" }} />`,
  )
  passives.push(
    `<resistor name="R2" connections={{ pin1: "net.V3_3", pin2: "U1.${take(U1)}" }} />`,
  )
  passives.push(
    `<resistor name="R3" connections={{ pin1: "net.VBAT", pin2: "U2.${take(U2)}" }} />`,
  )
  passives.push(
    `<resistor name="R4" connections={{ pin1: "U3.${take(U3)}" }} />`,
  )
  passives.push(`<resistor name="R5" connections={{ pin1: "R4.pin2" }} />`) // inter-passive
  passives.push(
    `<resistor name="R6" connections={{ pin1: "U8.${take(U8)}", pin2: "net.GND" }} />`,
  )
  passives.push(
    `<resistor name="R7" connections={{ pin1: "U9.${take(U9)}", pin2: "net.GND" }} />`,
  )
  passives.push(
    `<capacitor name="CB1" connections={{ pin1: "U2.${take(U2)}", pin2: "net.GND" }} />`,
  )
  passives.push(
    `<capacitor name="CB2" connections={{ pin1: "U6.${take(U6)}", pin2: "net.GND" }} />`,
  )

  const pos = (c: Chip) =>
    `{ top: [], left: ${JSON.stringify(c.left)}, right: ${JSON.stringify(c.right)}, bottom: [] }`
  const chipEls = chips.map(
    (c) => `<chip name="${c.name}" pinPosition={${pos(c)}} ${nets[c.name]} />`,
  )
  return [...chipEls, ...passives, ...traces].join("\n")
}

test("a nine-chip board places, routes, and obeys every routing rule", () => {
  const ast = build(buildCircuit())
  const placement = solveSchematic(ast)
  const names = placement.blocks.map((b) => b.name)

  // All nine chips and every passive are placed.
  for (let i = 1; i <= 9; i++) expect(names).toContain(`U${i}`)
  for (let i = 1; i <= 9; i++) expect(names).toContain(`CD${i}`)
  for (const n of ["CB1", "CB2"]) expect(names).toContain(n)
  for (let i = 1; i <= 7; i++) expect(names).toContain(`R${i}`)

  // The nine chips are packed in a 2D grid, not a single row: their top-Y values
  // cluster into at least three distinct row bands.
  const chipYs = placement.blocks
    .filter((b) => b.type === "chip")
    .map((b) => b.y)
    .sort((p, q) => p - q)
  let bands = 1
  for (let i = 1; i < chipYs.length; i++) {
    if (chipYs[i] - chipYs[i - 1] > 3) bands++
  }
  expect(bands).toBeGreaterThanOrEqual(3)

  const routed = solveTraces(placement)
  expect(routed.traces.length).toBeGreaterThan(0)

  const endsOf = (t: { points: { x: number; y: number }[] }) =>
    new Set([
      `${t.points[0].x},${t.points[0].y}`,
      `${t.points.at(-1)!.x},${t.points.at(-1)!.y}`,
    ])
  const segsOf = (t: { points: { x: number; y: number }[] }) =>
    t.points.slice(1).map((p, i) => ({ a: t.points[i], b: p }))

  // Vertically-adjacent U5 and U7 are wired together — that connection routes as a
  // trace (a short crossing path is taken when needed), it is not dropped to a
  // label just because the clean route would be long.
  const nameAt = new Map<string, string>()
  for (const b of placement.blocks)
    for (const p of b.pins) nameAt.set(`${p.x},${p.y}`, b.name)
  const u5u7Routed = routed.traces.some((t) => {
    const pair = [
      nameAt.get(`${t.points[0].x},${t.points[0].y}`),
      nameAt.get(`${t.points.at(-1)!.x},${t.points.at(-1)!.y}`),
    ]
      .sort()
      .join("-")
    return pair === "U5-U7"
  })
  expect(u5u7Routed).toBe(true)

  // Per-segment rules: Manhattan, no block interior, no chip-edge run, and a
  // passive edge only at the trace's own endpoints.
  for (const t of routed.traces) {
    const ends = endsOf(t)
    for (let i = 1; i < t.points.length; i++) {
      const p = t.points[i - 1]
      const q = t.points[i]
      expect(p.x === q.x || p.y === q.y).toBe(true)
      for (const blk of placement.blocks) {
        expect(segmentHitsRect(p, q, blk)).toBe(false)
        if (runsAlongEdge(p, q, blk)) {
          expect(blk.type).not.toBe("chip")
          const owns = blk.pins.some((pin) => ends.has(`${pin.x},${pin.y}`))
          expect(owns).toBe(true)
        }
      }
    }
  }

  // Clearance rule: no two traces run parallel within CLEARANCE (or overlap)
  // unless they share an endpoint.
  for (let i = 0; i < routed.traces.length; i++) {
    for (let j = i + 1; j < routed.traces.length; j++) {
      const shared = [...endsOf(routed.traces[i])].some((k) =>
        endsOf(routed.traces[j]).has(k),
      )
      if (shared) continue
      for (const s1 of segsOf(routed.traces[i]))
        for (const s2 of segsOf(routed.traces[j]))
          expect(segmentsTooClose(s1, s2, CLEARANCE)).toBe(false)
    }
  }

  expect(astToRoutedSvg(ast)).toMatchSchematicSvg(import.meta.path)
}, 20000) // dense 9-chip board: routing is heavier than the default 5s budget
