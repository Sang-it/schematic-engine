import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { solveTraces } from "../src/index"
import "./helpers"

test("unroutable connections drop the trace and number the net labels", () => {
  // Two vertical connections, each blocked across its only path (same x -> no L).
  const placement: Placement = {
    blocks: [
      {
        type: "chip",
        name: "A1",
        x: 0,
        y: 1,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 2 }],
      },
      {
        type: "chip",
        name: "B1",
        x: 0,
        y: 7,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 8 }],
      },
      {
        type: "chip",
        name: "WALL1",
        x: 1.5,
        y: 4,
        width: 1,
        height: 2,
        rotation: 0,
        pins: [],
      },
      {
        type: "chip",
        name: "A2",
        x: 10,
        y: 1,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 12, y: 2 }],
      },
      {
        type: "chip",
        name: "B2",
        x: 10,
        y: 7,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 12, y: 8 }],
      },
      {
        type: "chip",
        name: "WALL2",
        x: 11.5,
        y: 4,
        width: 1,
        height: 2,
        rotation: 0,
        pins: [],
      },
    ],
    connections: [
      { x1: 2, y1: 2, x2: 2, y2: 8 },
      { x1: 12, y1: 2, x2: 12, y2: 8 },
    ],
  }

  const { traces, labels } = solveTraces(placement)
  expect(traces).toHaveLength(0)
  // Two broken connections -> 4 labels: both ends of #1, both ends of #2.
  expect(labels.map((l) => l.label)).toEqual(["1", "1", "2", "2"])
  expect(labels.every((l) => l.side === "right")).toBe(true)
})
