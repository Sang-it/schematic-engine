import type { Placement } from "@schematic-engine/placement-solver"
import { expect, test } from "bun:test"
import { renderRoutedSvg, solveTraces } from "../src/index"
import "./helpers"

// Hand-built placement that exercises all three routing outcomes at once:
//  - a clear straight trace,
//  - an L-bend around an obstacle block,
//  - two unroutable connections that fall back to numbered net labels.
const PLACEMENT: Placement = {
  blocks: [
    {
      type: "chip",
      name: "U1",
      x: 0,
      y: 0,
      width: 4,
      height: 6,
      rotation: 0,
      pins: [
        { pin: "pin1", side: "right", x: 4, y: 1 },
        { pin: "pin2", side: "right", x: 4, y: 5 },
      ],
    },
    // Straight target: same y as U1.pin1, nothing in between.
    {
      type: "resistor",
      name: "Rstr",
      x: 8,
      y: 0.75,
      width: 1,
      height: 0.5,
      rotation: 0,
      pins: [{ pin: "pin1", side: "left", x: 8, y: 1 }],
    },
    // Obstacle blocking the straight U1.pin2 -> Rbend diagonal.
    {
      type: "chip",
      name: "OBS",
      x: 6,
      y: 2,
      width: 2,
      height: 3,
      rotation: 0,
      pins: [],
    },
    // L target: reached by bending around OBS.
    {
      type: "resistor",
      name: "Rbend",
      x: 10,
      y: 1.75,
      width: 1,
      height: 0.5,
      rotation: 0,
      pins: [{ pin: "pin1", side: "left", x: 10, y: 2 }],
    },
    // Broken pair #1: vertical connection walled off (same x -> no L).
    {
      type: "chip",
      name: "Ba",
      x: 0,
      y: 9,
      width: 2,
      height: 2,
      rotation: 0,
      pins: [{ pin: "pin1", side: "right", x: 2, y: 10 }],
    },
    {
      type: "chip",
      name: "Bb",
      x: 0,
      y: 13,
      width: 2,
      height: 2,
      rotation: 0,
      pins: [{ pin: "pin1", side: "right", x: 2, y: 14 }],
    },
    {
      type: "chip",
      name: "WALL1",
      x: 1.5,
      y: 11,
      width: 1,
      height: 2,
      rotation: 0,
      pins: [],
    },
    // Broken pair #2.
    {
      type: "chip",
      name: "Ca",
      x: 6,
      y: 9,
      width: 2,
      height: 2,
      rotation: 0,
      pins: [{ pin: "pin1", side: "right", x: 8, y: 10 }],
    },
    {
      type: "chip",
      name: "Cb",
      x: 6,
      y: 13,
      width: 2,
      height: 2,
      rotation: 0,
      pins: [{ pin: "pin1", side: "right", x: 8, y: 14 }],
    },
    {
      type: "chip",
      name: "WALL2",
      x: 7.5,
      y: 11,
      width: 1,
      height: 2,
      rotation: 0,
      pins: [],
    },
  ],
  connections: [
    { x1: 4, y1: 1, x2: 8, y2: 1 }, // straight
    { x1: 4, y1: 5, x2: 10, y2: 2 }, // L-bend around OBS
    { x1: 2, y1: 10, x2: 2, y2: 14 }, // broken -> label 1
    { x1: 8, y1: 10, x2: 8, y2: 14 }, // broken -> label 2
  ],
}

test("complex routing: straight, L-bend, and broken net labels", () => {
  const routed = solveTraces(PLACEMENT)

  // One straight (2 pts) and one L (3 pts); two connections broke.
  expect(routed.traces).toHaveLength(2)
  expect(routed.traces.map((t) => t.points.length).sort()).toEqual([2, 3])
  const bend = routed.traces.find((t) => t.points.length === 3)!
  expect(bend.points[1]).toEqual({ x: 10, y: 5 }) // corner

  // Two broken traces -> 4 labels numbered 1,1,2,2.
  expect(routed.labels.map((l) => l.label)).toEqual(["1", "1", "2", "2"])

  expect(renderRoutedSvg(routed)).toMatchSchematicSvg(import.meta.path)
})
