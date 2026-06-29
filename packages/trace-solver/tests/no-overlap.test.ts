import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { type Segment, segmentsOverlap } from "../src/geom"
import { solveTraces } from "../src/index"
import "./helpers"

const segmentsOf = (t: { points: { x: number; y: number }[] }): Segment[] =>
  t.points.slice(1).map((p, i) => ({ a: t.points[i], b: p }))

const endsOf = (t: { points: { x: number; y: number }[] }) =>
  new Set([
    `${t.points[0].x},${t.points[0].y}`,
    `${t.points.at(-1)!.x},${t.points.at(-1)!.y}`,
  ])

test("two traces that don't share a connection are routed without overlapping", () => {
  // Both chips have their wired pin on their OUTER side, so each connection must
  // wrap around its chip. The cheapest wrap is the same lane for both; since they
  // share no endpoint, the router must send them to different lanes (one over the
  // top, one under the bottom) rather than stacking them.
  const placement: Placement = {
    blocks: [
      {
        type: "chip",
        name: "L",
        x: 0,
        y: 0,
        width: 3,
        height: 6,
        rotation: 0,
        pins: [
          { pin: "pin1", side: "left", x: 0, y: 1 },
          { pin: "pin2", side: "left", x: 0, y: 2 },
        ],
      },
      {
        type: "chip",
        name: "R",
        x: 7,
        y: 0,
        width: 3,
        height: 6,
        rotation: 0,
        pins: [
          { pin: "pin1", side: "right", x: 10, y: 1 },
          { pin: "pin2", side: "right", x: 10, y: 2 },
        ],
      },
    ],
    connections: [
      { x1: 0, y1: 1, x2: 10, y2: 1 },
      { x1: 0, y1: 2, x2: 10, y2: 2 },
    ],
  }

  const { traces, labels } = solveTraces(placement)
  expect(traces).toHaveLength(2)
  expect(labels).toHaveLength(0)

  // No collinear overlap between the two (they share no endpoint).
  let overlaps = 0
  for (const s1 of segmentsOf(traces[0]))
    for (const s2 of segmentsOf(traces[1]))
      if (segmentsOverlap(s1, s2)) overlaps++
  expect(overlaps).toBe(0)
})

test("two traces sharing a pin may overlap", () => {
  // Both connections start at the same pin M.pin1 (4,3). They run together along
  // y=3 before splitting — that overlap is allowed because they share a
  // connection (the common pin).
  const placement: Placement = {
    blocks: [
      {
        type: "chip",
        name: "M",
        x: 2,
        y: 2,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 4, y: 3 }],
      },
      {
        type: "chip",
        name: "Q",
        x: 10,
        y: 2,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "left", x: 10, y: 3 }],
      },
      {
        type: "chip",
        name: "R",
        x: 7,
        y: 6,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "top", x: 8, y: 6 }],
      },
    ],
    connections: [
      { x1: 4, y1: 3, x2: 10, y2: 3 },
      { x1: 4, y1: 3, x2: 8, y2: 6 },
    ],
  }

  const { traces, labels } = solveTraces(placement)
  expect(traces).toHaveLength(2)
  expect(labels).toHaveLength(0)

  // The two traces share the pin (4,3) and do overlap — which is permitted.
  expect([...endsOf(traces[0])].some((k) => endsOf(traces[1]).has(k))).toBe(
    true,
  )
  let overlaps = 0
  for (const s1 of segmentsOf(traces[0]))
    for (const s2 of segmentsOf(traces[1]))
      if (segmentsOverlap(s1, s2)) overlaps++
  expect(overlaps).toBeGreaterThan(0)
})
