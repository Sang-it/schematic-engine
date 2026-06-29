import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { solveTraces } from "../src/index"
import "./helpers"

test("a blocked straight line falls back to a clear L route", () => {
  // Straight A(2,1)->B(7,5) crosses chip C; the L via corner (7,1) is clear. A and
  // B are resistors (passives), so the L's vertical leg may legally run along B's
  // edge — it is the route's endpoint passive (a trace may hug a passive edge only
  // at its own endpoints, never a chip edge).
  const placement: Placement = {
    blocks: [
      {
        type: "resistor",
        name: "A",
        x: 1,
        y: 0.75,
        width: 1,
        height: 0.5,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 1 }],
      },
      {
        type: "resistor",
        name: "B",
        x: 7,
        y: 4.75,
        width: 1,
        height: 0.5,
        rotation: 0,
        pins: [{ pin: "pin1", side: "left", x: 7, y: 5 }],
      },
      {
        type: "chip",
        name: "C",
        x: 3,
        y: 2,
        width: 3,
        height: 4,
        rotation: 0,
        pins: [],
      },
    ],
    connections: [{ x1: 2, y1: 1, x2: 7, y2: 5 }],
  }

  const { traces, labels } = solveTraces(placement)
  expect(labels).toHaveLength(0)
  expect(traces).toHaveLength(1)
  expect(traces[0].points).toEqual([
    { x: 2, y: 1 },
    { x: 7, y: 1 },
    { x: 7, y: 5 },
  ])
})
