import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { solveTraces } from "../src/index"
import "./helpers"

test("a pin reachable only around a block routes as a multi-bend trace", () => {
  // A(2,5) and B(2,11) share x; a wall sits on the direct path, so the only
  // route is a detour with two turns (out, down past the wall, back in).
  const placement: Placement = {
    blocks: [
      {
        type: "chip",
        name: "A",
        x: 0,
        y: 4,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 5 }],
      },
      {
        type: "chip",
        name: "B",
        x: 0,
        y: 10,
        width: 2,
        height: 2,
        rotation: 0,
        pins: [{ pin: "pin1", side: "right", x: 2, y: 11 }],
      },
      {
        type: "chip",
        name: "WALL",
        x: 1.5,
        y: 6,
        width: 3,
        height: 3,
        rotation: 0,
        pins: [],
      },
    ],
    connections: [{ x1: 2, y1: 5, x2: 2, y2: 11 }],
  }

  const { traces, labels } = solveTraces(placement)
  expect(labels).toHaveLength(0)
  expect(traces).toHaveLength(1)
  const pts = traces[0].points
  expect(pts.length).toBeGreaterThan(3) // more than a single L

  // Every segment is axis-aligned and clears the wall interior.
  const wall = placement.blocks.find((b) => b.name === "WALL")!
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1]
    const q = pts[i]
    expect(p.x === q.x || p.y === q.y).toBe(true)
    const midX = (p.x + q.x) / 2
    const midY = (p.y + q.y) / 2
    const insideWall =
      midX > wall.x &&
      midX < wall.x + wall.width &&
      midY > wall.y &&
      midY < wall.y + wall.height
    expect(insideWall).toBe(false)
  }
})
