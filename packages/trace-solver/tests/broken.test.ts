import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { solveTraces } from "../src/index"
import "./helpers"

test("unroutable connections drop the trace and number the net labels", () => {
  // Each connection's source pin is buried inside an overlapping wall block, so
  // no path (straight, L, or multi-bend) can leave it.
  const placement: Placement = {
    blocks: [
      {
        type: "chip",
        name: "A1",
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 1 }],
      },
      // WALL1 covers A1.pin1 (2,1) in its interior -> the pin is trapped.
      {
        type: "chip",
        name: "WALL1",
        x: 1,
        y: 0,
        width: 3,
        height: 2,
        rotation: 0,
        pins: [],
      },
      {
        type: "chip",
        name: "B1",
        x: 0,
        y: 6,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 7 }],
      },
      {
        type: "chip",
        name: "A2",
        x: 10,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 12, y: 1 }],
      },
      {
        type: "chip",
        name: "WALL2",
        x: 11,
        y: 0,
        width: 3,
        height: 2,
        rotation: 0,
        pins: [],
      },
      {
        type: "chip",
        name: "B2",
        x: 10,
        y: 6,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 12, y: 7 }],
      },
    ],
    connections: [
      { x1: 2, y1: 1, x2: 2, y2: 7 },
      { x1: 12, y1: 1, x2: 12, y2: 7 },
    ],
  }

  const { traces, labels } = solveTraces(placement)
  expect(traces).toHaveLength(0)
  // Two broken connections -> 4 labels: both ends of #1, both ends of #2.
  expect(labels.map((l) => l.label)).toEqual(["1", "1", "2", "2"])
  expect(labels.every((l) => l.side === "right")).toBe(true)
})
