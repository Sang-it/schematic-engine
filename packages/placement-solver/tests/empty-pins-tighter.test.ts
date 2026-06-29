import { build } from "@schematic-engine/core"
import { expect, test } from "bun:test"
import { solveSchematic } from "../src/index"
import "./helpers"

// A side of net-only / empty pins packs tighter than the same side where the
// pins carry passives (passive pins reserve more room, growing the box).
test("net-only / empty pins pack tighter than passive-bearing pins", () => {
  const rightPins = Array.from({ length: 8 }, (_, i) => `"pin${i + 1}"`).join(
    ", ",
  )
  const conns = Array.from(
    { length: 8 },
    (_, i) => `pin${i + 1}: "net.N${i + 1}"`,
  ).join(", ")

  const netOnly = solveSchematic(
    build(
      `<chip name="U1" pinPosition={{ right: [${rightPins}] }} connections={{ ${conns} }} />`,
    ),
  )
  // Same chip, but every right pin also has a resistor attached.
  const resistors = Array.from(
    { length: 8 },
    (_, i) =>
      `<resistor name="R${i + 1}" connections={{ pin1: "U1.pin${i + 1}" }} />`,
  ).join("\n")
  const withPassives = solveSchematic(
    build(
      `<chip name="U1" pinPosition={{ right: [${rightPins}] }} connections={{ ${conns} }} />\n${resistors}`,
    ),
  )

  const h = (p: typeof netOnly) => p.blocks.find((b) => b.name === "U1")!.height
  expect(h(netOnly)).toBeLessThan(h(withPassives))
})
