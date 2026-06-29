import type { Placement } from "@schematic-engine/placement-solver"
import { runsAlongEdge } from "../src/geom"
import { expect, test } from "bun:test"
import { solveTraces } from "../src/index"
import "./helpers"

test("a multi-bend trace routes around a chip without running along its edges", () => {
  // A(2,3) and B(2,13) share x; a chip sits on the direct path. The detour must
  // route in the clearance channel beside the chip, never on the chip's edge.
  const placement: Placement = {
    blocks: [
      {
        type: "resistor",
        name: "A",
        x: 0,
        y: 2,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 3 }],
      },
      {
        type: "resistor",
        name: "B",
        x: 0,
        y: 12,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 13 }],
      },
      {
        type: "chip",
        name: "U",
        x: 1.5,
        y: 5,
        width: 4,
        height: 5,
        rotation: 0,
        pins: [],
      },
    ],
    connections: [{ x1: 2, y1: 3, x2: 2, y2: 13 }],
  }

  const { traces, labels } = solveTraces(placement)
  expect(labels).toHaveLength(0)
  expect(traces).toHaveLength(1)
  const pts = traces[0].points
  expect(pts.length).toBeGreaterThan(3)

  const endpoints = new Set(["A", "B"])
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]
    const q = pts[i]
    expect(p.x === q.x || p.y === q.y).toBe(true) // axis-aligned
    for (const blk of placement.blocks) {
      // No segment may run along a chip edge or a non-endpoint passive edge.
      if (blk.type === "chip" || !endpoints.has(blk.name)) {
        expect(runsAlongEdge(p, q, blk)).toBe(false)
      }
    }
  }
})
