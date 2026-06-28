import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import { CHIP_4_SIDES } from "./helpers"

test("anchor chip is placed first at the origin", () => {
  const { blocks } = solveSchematic(build(CHIP_4_SIDES))
  expect(blocks[0].name).toBe("U1")
  expect(blocks[0]).toMatchObject({ x: 0, y: 0, rotation: 0 })
})
