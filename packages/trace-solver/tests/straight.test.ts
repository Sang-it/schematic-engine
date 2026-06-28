import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { solveTraces } from "../src/index"
import "./helpers"

test("a clear connection is routed as a straight 2-point trace", () => {
  const placement: Placement = {
    blocks: [
      {
        type: "chip",
        name: "A",
        x: 0,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 1 }],
      },
      {
        type: "chip",
        name: "B",
        x: 6,
        y: 0,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "left", x: 6, y: 1 }],
      },
    ],
    connections: [{ x1: 2, y1: 1, x2: 6, y2: 1 }],
  }

  const { traces, labels } = solveTraces(placement)
  expect(labels).toHaveLength(0)
  expect(traces).toHaveLength(1)
  expect(traces[0].points).toEqual([
    { x: 2, y: 1 },
    { x: 6, y: 1 },
  ])
})
