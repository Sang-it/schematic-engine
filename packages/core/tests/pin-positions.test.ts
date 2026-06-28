import { expect, test } from "bun:test"
import { build } from "../src/index"

test("resistor/capacitor: pin1 left-middle, pin2 right-middle", () => {
  const ast = build(`
    <resistor name="R1" connections={{ pin1: "net.A", pin2: "net.B" }} />
    <capacitor name="C1" connections={{ pin1: "net.A", pin2: "net.B" }} />
  `)
  // core only assigns sides; coordinates are computed in the placement solver
  expect(ast.resistors[0].pinPositions).toEqual([
    { pin: "pin1", side: "left" },
    { pin: "pin2", side: "right" },
  ])
  expect(ast.capacitors[0].pinPositions).toEqual([
    { pin: "pin1", side: "left" },
    { pin: "pin2", side: "right" },
  ])
})

test("chip default split (even): half left, half right", () => {
  const ast = build(
    `<chip name="U1" connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D" }} />`,
  )
  const pos = ast.chips[0].pinPositions
  expect(pos.filter((p) => p.side === "left").map((p) => p.pin)).toEqual([
    "pin1",
    "pin2",
  ])
  expect(pos.filter((p) => p.side === "right").map((p) => p.pin)).toEqual([
    "pin3",
    "pin4",
  ])
})

test("chip default split (odd): left n, right n+1", () => {
  const ast = build(
    `<chip name="U1" connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D", pin5: "net.E" }} />`,
  )
  const pos = ast.chips[0].pinPositions
  expect(pos.filter((p) => p.side === "left").map((p) => p.pin)).toEqual([
    "pin1",
    "pin2",
  ])
  expect(pos.filter((p) => p.side === "right").map((p) => p.pin)).toEqual([
    "pin3",
    "pin4",
    "pin5",
  ])
})

test("chip explicit pinPosition assigns pins to named sides", () => {
  const ast = build(`
    <chip
      name="U1"
      pinPosition={{ top: ["pin1"], left: ["pin2"], right: ["pin3"], bottom: ["pin4"] }}
      connections={{ pin1: "net.A", pin2: "net.B", pin3: "net.C", pin4: "net.D" }}
    />
  `)
  const bySide = Object.fromEntries(
    ast.chips[0].pinPositions.map((p) => [p.pin, p.side]),
  )
  expect(bySide).toEqual({
    pin1: "top",
    pin2: "left",
    pin3: "right",
    pin4: "bottom",
  })
})
