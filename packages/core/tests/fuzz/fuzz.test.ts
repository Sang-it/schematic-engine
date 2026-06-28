import { expect, test } from "bun:test"
import { build, parse, parseConnectionTarget } from "../../src/index"
import type { ConnectionTarget } from "../../src/index"

// ---------------------------------------------------------------------------
// Deterministic PRNG so any failure is reproducible from its seed.
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const int = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1))
const pick = <T>(rng: () => number, arr: T[]): T =>
  arr[int(rng, 0, arr.length - 1)]

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
function label(rng: () => number): string {
  const n = int(rng, 2, 4)
  let s = ""
  for (let i = 0; i < n; i++) s += LETTERS[int(rng, 0, LETTERS.length - 1)]
  return s
}

// ---------------------------------------------------------------------------
// Invariants every ConnectionTarget must satisfy.
// ---------------------------------------------------------------------------
function assertWellFormed(t: ConnectionTarget | undefined): asserts t {
  expect(t).toBeDefined()
  if (!t) return
  expect(["net", "pin"]).toContain(t.kind)
  if (t.kind === "net") {
    expect(typeof t.name).toBe("string")
  } else {
    expect(typeof t.component).toBe("string")
    expect(t.component.length).toBeGreaterThan(0)
    expect(typeof t.pin).toBe("string")
    expect(t.pin.length).toBeGreaterThan(0)
    if (t.componentType !== undefined) {
      expect(["chip", "resistor", "capacitor", "net"]).toContain(
        t.componentType,
      )
    }
  }
}

const PIN_RE = /^pin\d+$/

// ---------------------------------------------------------------------------
// Circuit generator: emits valid JSX plus the exact expected parse result so
// we can round-trip-check, not just sanity-check.
// ---------------------------------------------------------------------------
type Comp = {
  tag: "chip" | "resistor" | "capacitor"
  name: string
  pins: string[]
}

function genTarget(
  rng: () => number,
  nets: string[],
  comps: Comp[],
): { str: string; expected: ConnectionTarget } {
  const canNet = nets.length > 0
  const canPin = comps.length > 0
  const useNet = canNet && (!canPin || rng() < 0.5)
  if (useNet) {
    const net = pick(rng, nets)
    const str = rng() < 0.5 ? `net.${net}` : net
    return { str, expected: { kind: "net", name: net } }
  }
  const comp = pick(rng, comps)
  const pin = pick(rng, comp.pins)
  if (rng() < 0.5) {
    return {
      str: `${comp.name}.${pin}`,
      expected: { kind: "pin", component: comp.name, pin },
    }
  }
  return {
    str: `${comp.tag}.${comp.name}.${pin}`,
    expected: {
      kind: "pin",
      componentType: comp.tag,
      component: comp.name,
      pin,
    },
  }
}

function genCircuit(seed: number) {
  const rng = makeRng(seed)
  const nNets = int(rng, 1, 5)
  const nets = Array.from({ length: nNets }, (_, i) => `N${i}`)

  const nComps = int(rng, 1, 8)
  const comps: Comp[] = []
  let chip = 0
  let res = 0
  let cap = 0
  for (let i = 0; i < nComps; i++) {
    const tag = pick(rng, ["chip", "resistor", "capacitor"] as const)
    const nPins = tag === "chip" ? int(rng, 1, 6) : 2
    const pins = Array.from({ length: nPins }, (_, p) => `pin${p + 1}`)
    let name: string
    if (tag === "chip") name = `U${chip++}`
    else if (tag === "resistor") name = `R${res++}`
    else name = `C${cap++}`
    comps.push({ tag, name, pins })
  }

  // Emit JSX + expected connections per component.
  const expected = new Map<string, Record<string, ConnectionTarget>>()
  const lines: string[] = []
  for (const net of nets) lines.push(`<net name="${net}" />`)
  for (const comp of comps) {
    const others = comps.filter((c) => c !== comp)
    const conns: Record<string, ConnectionTarget> = {}
    const connParts: string[] = []
    for (const pin of comp.pins) {
      const { str, expected: ex } = genTarget(rng, nets, others)
      conns[pin] = ex
      connParts.push(`${pin}: ${JSON.stringify(str)}`)
    }
    expected.set(comp.name, conns)
    let pinsAttr = ""
    if (rng() < 0.4) {
      const parts = comp.pins.map((p) => `${p}: ${JSON.stringify(label(rng))}`)
      pinsAttr = ` pins={{ ${parts.join(", ")} }}`
    }
    lines.push(
      `<${comp.tag} name="${comp.name}"${pinsAttr} connections={{ ${connParts.join(", ")} }} />`,
    )
  }

  return {
    code: lines.join("\n"),
    nets,
    comps,
    expected,
    counts: { chips: chip, resistors: res, capacitors: cap },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("fuzz: generated circuits round-trip through parse exactly", () => {
  for (let i = 0; i < 400; i++) {
    const seed = 1000 + i
    const { code, counts, nets, expected } = genCircuit(seed)
    let ir
    try {
      ir = parse(code)
    } catch (err) {
      throw new Error(`seed ${seed} threw: ${err}\n--- code ---\n${code}`)
    }

    expect(ir.chips.length, `seed ${seed} chips`).toBe(counts.chips)
    expect(ir.resistors.length, `seed ${seed} resistors`).toBe(counts.resistors)
    expect(ir.capacitors.length, `seed ${seed} capacitors`).toBe(
      counts.capacitors,
    )
    expect(ir.nets.map((n) => n.name).sort(), `seed ${seed} nets`).toEqual(
      [...nets].sort(),
    )

    for (const comp of [...ir.chips, ...ir.resistors, ...ir.capacitors]) {
      const want = expected.get(comp.name)!
      expect(comp.connections, `seed ${seed} ${comp.name} connections`).toEqual(
        want,
      )
      for (const key of Object.keys(comp.connections)) {
        expect(key).toMatch(PIN_RE)
      }
      for (const t of Object.values(comp.connections)) assertWellFormed(t)
      for (const [k, v] of Object.entries(comp.pins)) {
        expect(k).toMatch(PIN_RE)
        expect(typeof v).toBe("string")
      }
    }
  }
})

test("fuzz: parseConnectionTarget never throws and is always well-formed", () => {
  const alphabet = "abcABC123._/netchipresistorcapacitorpin "
  for (let i = 0; i < 4000; i++) {
    const rng = makeRng(50_000 + i)
    const len = int(rng, 0, 24)
    let s = ""
    for (let j = 0; j < len; j++)
      s += alphabet[int(rng, 0, alphabet.length - 1)]
    let t: ConnectionTarget
    try {
      t = parseConnectionTarget(s)
    } catch (err) {
      throw new Error(
        `parseConnectionTarget(${JSON.stringify(s)}) threw: ${err}`,
      )
    }
    assertWellFormed(t)
  }
})

test("fuzz: parse tolerates JSX-ish garbage without malformed output", () => {
  const alphabet = `<>/={}"' \nabcU1netchippinconnections,:.`
  let parsedOk = 0
  for (let i = 0; i < 1500; i++) {
    const rng = makeRng(200_000 + i)
    const len = int(rng, 0, 60)
    let s = ""
    for (let j = 0; j < len; j++)
      s += alphabet[int(rng, 0, alphabet.length - 1)]
    let ir
    try {
      ir = parse(s)
    } catch {
      continue // babel rejected invalid syntax — acceptable
    }
    parsedOk++
    // If it parsed, the shape must always be sound.
    for (const arr of [ir.chips, ir.resistors, ir.capacitors]) {
      expect(Array.isArray(arr)).toBe(true)
      for (const c of arr) {
        expect(typeof c.name).toBe("string")
        for (const t of Object.values(c.connections)) assertWellFormed(t)
      }
    }
    expect(Array.isArray(ir.nets)).toBe(true)
    expect(Array.isArray(ir.traces)).toBe(true)
    for (const tr of ir.traces) {
      if (tr.from) assertWellFormed(tr.from)
      if (tr.to) assertWellFormed(tr.to)
    }
  }
  // Sanity: the empty string at least is a valid parse, so >0 succeeded.
  expect(parsedOk).toBeGreaterThan(0)
})

test("fuzz: traces always desugar onto both pin endpoints", () => {
  for (let i = 0; i < 300; i++) {
    const seed = 700_000 + i
    const rng = makeRng(seed)
    // Two components, wire a random pin of each together via a trace.
    const aPins = int(rng, 1, 4)
    const bPins = int(rng, 1, 4)
    const aPin = `pin${int(rng, 1, aPins)}`
    const bPin = `pin${int(rng, 1, bPins)}`
    const code = `
      <chip name="A" connections={{ ${Array.from({ length: aPins }, (_, p) => `pin${p + 1}: "net.G"`).join(", ")} }} />
      <resistor name="B" connections={{ ${Array.from({ length: bPins }, (_, p) => `pin${p + 1}: "net.G"`).join(", ")} }} />
      <net name="G" />
      <trace from="A.${aPin}" to="B.${bPin}" />
    `
    const ast = build(code)
    expect(ast).not.toHaveProperty("traces")
    const a = ast.chips.find((c) => c.name === "A")!
    const b = ast.resistors.find((c) => c.name === "B")!
    expect(a.connections[aPin as `pin${number}`]).toEqual({
      kind: "pin",
      component: "B",
      pin: bPin,
    })
    expect(b.connections[bPin as `pin${number}`]).toEqual({
      kind: "pin",
      component: "A",
      pin: aPin,
    })
  }
})
