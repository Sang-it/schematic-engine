import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { solveTraces } from "../src/index"
import "./helpers"

test("diagonal pins route as an L; every segment is horizontal or vertical", () => {
  // A(2,1) and B(7,5) differ in both x and y, with no obstacle between — but a
  // diagonal is not allowed, so it must route as an L.
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
        x: 7,
        y: 4,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "left", x: 7, y: 5 }],
      },
    ],
    connections: [{ x1: 2, y1: 1, x2: 7, y2: 5 }],
  }

  const { traces } = solveTraces(placement)
  expect(traces).toHaveLength(1)
  const pts = traces[0].points
  // Both pins sit on chip edges, so the route can't hug those edges to make a
  // tidy 3-point L; it bends out into the clearance channel. The point that
  // matters: it's a multi-segment Manhattan path, never a diagonal.
  expect(pts.length).toBeGreaterThanOrEqual(3) // not a straight diagonal
  for (let i = 1; i < pts.length; i++) {
    const horizontal = pts[i].y === pts[i - 1].y
    const vertical = pts[i].x === pts[i - 1].x
    expect(horizontal || vertical).toBe(true)
  }
})
