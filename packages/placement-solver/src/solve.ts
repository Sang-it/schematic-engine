import type {
  Capacitor,
  Chip,
  Connections,
  ConnectionTarget,
  PinSide,
  Resistor,
  SchematicAst,
} from "@schematic-engine/core"
import { layoutChipPins } from "./pin-coords"
import type { SidePair } from "./pin-coords"
import { placeSequentially } from "./place"
import type {
  Placement,
  PlacedBlock,
  PlacedConnection,
  PlacedPin,
} from "./types"

/** Gap between the chip edge / pin and a placed passive, in schematic units. */
const PASSIVE_GAP = 2
/** Step used to nudge a passive out of a collision, in schematic units. */
const COLLISION_STEP = 0.5
/** Required clear gap along the axis a passive shifts on, in schematic units. */
const GAP_MAJOR = 1
/** Required clear gap along the axis perpendicular to the shift. */
const GAP_MINOR = 0.5
/** Min gap between adjacent pins that only carry a net label / nothing. The
 * outward net-label box is ~0.3 units wide along the edge, so this packs them
 * almost touching. */
const LABEL_PIN_GAP = 0.35

interface TaggedPassive {
  type: "resistor" | "capacitor"
  comp: Resistor | Capacitor
}

/**
 * Placement precedence for passives: earlier entries are placed first and so
 * claim the better spots. To add a new passive component type, append an entry
 * here (and extend the AST/BlockType) — the placement loop itself is generic
 * and needs no change.
 */
const PASSIVE_PRECEDENCE: Array<{
  type: TaggedPassive["type"]
  select: (ast: SchematicAst) => (Resistor | Capacitor)[]
}> = [
  { type: "resistor", select: (ast) => ast.resistors },
  { type: "capacitor", select: (ast) => ast.capacitors },
]

/** A pin-to-pin endpoint: a passive's pin wired to another component's pin. */
interface PinEndpoint {
  passivePin: string
  targetComp: string
  targetPin: string
}

/** Counts used to slot a passive into a placement tier. */
interface PassiveClass {
  chipEndpoints: number
  passiveEndpoints: number
}

/**
 * Placement tiers, applied in order. A passive is placed in the first tier it
 * matches. To support new connection shapes, insert a tier here — the engine
 * loops tiers generically.
 */
const PASSIVE_TIERS: Array<{
  name: string
  match: (c: PassiveClass) => boolean
}> = [
  // 1. Passives with BOTH pins wired to the chip.
  {
    name: "chip-double",
    match: (c) => c.passiveEndpoints === 0 && c.chipEndpoints >= 2,
  },
  // 2. Remaining passives wired only to the chip (a single pin).
  {
    name: "chip-only",
    match: (c) => c.passiveEndpoints === 0 && c.chipEndpoints >= 1,
  },
  // 3. Passives wired to a chip + passive, or to passives only.
  { name: "inter-passive", match: (c) => c.passiveEndpoints >= 1 },
]

/** The net a pin connects to, if its connection targets a net. */
function netOfPin(
  comp: { connections: Connections },
  pinId: string,
): string | undefined {
  const t = comp.connections[pinId as keyof Connections]
  return t && t.kind === "net" ? t.name : undefined
}

/** Pin-target connections of a component (net targets are ignored). */
function pinEndpoints(comp: { connections: Connections }): PinEndpoint[] {
  const eps: PinEndpoint[] = []
  for (const [passivePin, target] of Object.entries(comp.connections)) {
    const t = target as ConnectionTarget | undefined
    if (t && t.kind === "pin") {
      eps.push({ passivePin, targetComp: t.component, targetPin: t.pin })
    }
  }
  return eps
}

/**
 * Same-side double passives of `anchor`: passives whose BOTH pins connect to
 * this chip on the same side. Each yields a pin pair that must be adjacent and
 * spaced to fit the passive. A chip pin is used by at most one pair.
 */
function sameSidePairs(anchor: Chip, passives: TaggedPassive[]): SidePair[] {
  const sideOf = new Map<string, PinSide>()
  for (const p of anchor.pinPositions) sideOf.set(p.pin, p.side)

  const used = new Set<string>()
  const pairs: SidePair[] = []
  for (const { comp } of passives) {
    const chipEps = pinEndpoints(comp).filter(
      (e) => e.targetComp === anchor.name,
    )
    if (chipEps.length !== 2) continue
    const [a, b] = chipEps
    const sideA = sideOf.get(a.targetPin)
    const sideB = sideOf.get(b.targetPin)
    if (!sideA || sideA !== sideB) continue
    if (used.has(a.targetPin) || used.has(b.targetPin)) continue
    used.add(a.targetPin)
    used.add(b.targetPin)
    pairs.push({
      side: sideA,
      pinA: a.targetPin,
      pinB: b.targetPin,
      minGap: comp.schematicSize.defaultSchematicWidth + GAP_MINOR,
    })
  }
  return pairs
}

/** Relative pin definition inside a passive box, resolved to absolute later. */
interface RelPin {
  pin: string
  side: PinSide
  rx: number
  ry: number
}

/** An axis-aligned rectangle in schematic units. */
interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** True when the boxes are closer than the required gap on either axis. */
function tooClose(a: Rect, b: Rect, gapX: number, gapY: number): boolean {
  return !(
    a.x + a.width + gapX <= b.x ||
    b.x + b.width + gapX <= a.x ||
    a.y + a.height + gapY <= b.y ||
    b.y + b.height + gapY <= a.y
  )
}

function connectionCount(c: Chip | Resistor | Capacitor): number {
  return Object.values(c.connections).filter(Boolean).length
}

function otherPin(pin: string): string {
  return pin === "pin1" ? "pin2" : "pin1"
}

/**
 * Geometry for a single-connection passive next to a chip pin. The connecting
 * pin faces the chip; the symbol is rotated when the connecting pin isn't the
 * one that naturally faces the chip in the default (pin1-left, pin2-right)
 * orientation.
 */
function singlePassiveGeometry(
  side: PinSide,
  cp: PlacedPin,
  connectingPin: string,
  pw: number,
  ph: number,
): {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  pins: RelPin[]
  axis: "x" | "y"
  dir: 1 | -1
} {
  const other = otherPin(connectingPin)
  switch (side) {
    case "right":
      return {
        x: cp.x + PASSIVE_GAP,
        y: cp.y - ph / 2,
        width: pw,
        height: ph,
        rotation: connectingPin === "pin1" ? 0 : 180,
        axis: "x",
        dir: 1,
        pins: [
          { pin: connectingPin, side: "left", rx: 0, ry: ph / 2 },
          { pin: other, side: "right", rx: pw, ry: ph / 2 },
        ],
      }
    case "left":
      return {
        x: cp.x - PASSIVE_GAP - pw,
        y: cp.y - ph / 2,
        width: pw,
        height: ph,
        rotation: connectingPin === "pin2" ? 0 : 180,
        axis: "x",
        dir: -1,
        pins: [
          { pin: connectingPin, side: "right", rx: pw, ry: ph / 2 },
          { pin: other, side: "left", rx: 0, ry: ph / 2 },
        ],
      }
    case "top":
      return {
        x: cp.x - ph / 2,
        y: cp.y - PASSIVE_GAP - pw,
        width: ph,
        height: pw,
        rotation: connectingPin === "pin1" ? 270 : 90,
        axis: "y",
        dir: -1,
        pins: [
          { pin: connectingPin, side: "bottom", rx: ph / 2, ry: pw },
          { pin: other, side: "top", rx: ph / 2, ry: 0 },
        ],
      }
    case "bottom":
      return {
        x: cp.x - ph / 2,
        y: cp.y + PASSIVE_GAP,
        width: ph,
        height: pw,
        rotation: connectingPin === "pin1" ? 90 : 270,
        axis: "y",
        dir: 1,
        pins: [
          { pin: connectingPin, side: "top", rx: ph / 2, ry: 0 },
          { pin: other, side: "bottom", rx: ph / 2, ry: pw },
        ],
      }
  }
}

/**
 * Geometry for a double-connection passive. The symbol runs PARALLEL to the
 * anchor edge (vertical for a left/right pin, horizontal for a top/bottom pin)
 * so it can sit alongside the chip; the anchor pin is aligned to its chip pin
 * and the other pin is wired across to its chip pin.
 */
function doublePassiveGeometry(
  side: PinSide,
  cp: PlacedPin,
  anchorPin: string,
  pw: number,
  ph: number,
): {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  pins: RelPin[]
  axis: "x" | "y"
  dir: 1 | -1
} {
  if (side === "left" || side === "right") {
    // Vertical symbol: pin1 on top, pin2 on bottom.
    const width = ph
    const height = pw
    const x = side === "right" ? cp.x + PASSIVE_GAP : cp.x - PASSIVE_GAP - width
    const y = anchorPin === "pin1" ? cp.y : cp.y - height
    return {
      x,
      y,
      width,
      height,
      rotation: 90,
      axis: "x",
      dir: side === "right" ? 1 : -1,
      pins: [
        { pin: "pin1", side: "top", rx: width / 2, ry: 0 },
        { pin: "pin2", side: "bottom", rx: width / 2, ry: height },
      ],
    }
  }
  // Horizontal symbol on a top/bottom edge: pin1 left, pin2 right.
  const width = pw
  const height = ph
  const y = side === "top" ? cp.y - PASSIVE_GAP - height : cp.y + PASSIVE_GAP
  const x = anchorPin === "pin1" ? cp.x : cp.x - width
  return {
    x,
    y,
    width,
    height,
    rotation: 0,
    axis: "y",
    dir: side === "top" ? -1 : 1,
    pins: [
      { pin: "pin1", side: "left", rx: 0, ry: height / 2 },
      { pin: "pin2", side: "right", rx: width, ry: height / 2 },
    ],
  }
}

/**
 * Geometry for a double-connection passive whose two endpoints sit on the SAME
 * side. The symbol is centred between the two pins (instead of aligning to one)
 * and runs parallel to that edge. Each passive pin is assigned to the endpoint
 * nearest it.
 */
function doubleCenteredGeometry(
  side: PinSide,
  a: { passivePin: string; placedPin: PlacedPin },
  b: { passivePin: string; placedPin: PlacedPin },
  pw: number,
  ph: number,
): {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  pins: RelPin[]
  axis: "x" | "y"
  dir: 1 | -1
} {
  if (side === "left" || side === "right") {
    // Vertical, centred on the midpoint of the two pin y's.
    const width = ph
    const height = pw
    const edgeX = a.placedPin.x
    const x =
      side === "right" ? edgeX + PASSIVE_GAP : edgeX - PASSIVE_GAP - width
    const midY = (a.placedPin.y + b.placedPin.y) / 2
    const top = a.placedPin.y <= b.placedPin.y ? a : b
    const bottom = top === a ? b : a
    return {
      x,
      y: midY - height / 2,
      width,
      height,
      rotation: 90,
      axis: "x",
      dir: side === "right" ? 1 : -1,
      pins: [
        { pin: top.passivePin, side: "top", rx: width / 2, ry: 0 },
        { pin: bottom.passivePin, side: "bottom", rx: width / 2, ry: height },
      ],
    }
  }
  // Horizontal, centred on the midpoint of the two pin x's.
  const width = pw
  const height = ph
  const edgeY = a.placedPin.y
  const y = side === "top" ? edgeY - PASSIVE_GAP - height : edgeY + PASSIVE_GAP
  const midX = (a.placedPin.x + b.placedPin.x) / 2
  const left = a.placedPin.x <= b.placedPin.x ? a : b
  const right = left === a ? b : a
  return {
    x: midX - width / 2,
    y,
    width,
    height,
    rotation: 0,
    axis: "y",
    dir: side === "top" ? -1 : 1,
    pins: [
      { pin: left.passivePin, side: "left", rx: 0, ry: height / 2 },
      { pin: right.passivePin, side: "right", rx: width, ry: height / 2 },
    ],
  }
}

/** Resolve absolute pins from a box origin + relative pin defs. */
function resolvePins(x: number, y: number, rel: RelPin[]): PlacedPin[] {
  return rel.map((p) => ({
    pin: p.pin,
    side: p.side,
    x: x + p.rx,
    y: y + p.ry,
  }))
}

/**
 * Shift a box along one axis until it clears every obstacle. Passives anchored
 * to a left/right pin move on x; those anchored to a top/bottom pin move on y.
 * Required gaps: GAP_MAJOR along the shift axis, GAP_MINOR perpendicular.
 */
function resolveCollision(
  box: PlacedBlock,
  obstacles: Rect[],
  axis: "x" | "y",
  dir: 1 | -1,
): void {
  const gapX = axis === "x" ? GAP_MAJOR : GAP_MINOR
  const gapY = axis === "y" ? GAP_MAJOR : GAP_MINOR
  while (obstacles.some((o) => tooClose(box, o, gapX, gapY))) {
    box[axis] += dir * COLLISION_STEP
  }
}

const SIDE_RANK: Record<PinSide, number> = {
  right: 0,
  left: 1,
  top: 2,
  bottom: 3,
}

/**
 * Place ONE chip and the passives reachable from it, as an independent
 * schematic (the chip sits at the local origin).
 *
 * Each passive is anchored to one of its pins, with the connecting pin facing
 * the anchor (rotated as needed). A chip-double prefers the chip pin that
 * isn't already taken and reserves its channel; a double touching a passive is
 * laid out like a single. Collisions slide along the boundary axis. Passives
 * not reachable from this chip are simply not placed (left for another chip);
 * `placed` reports the names this schematic consumed.
 */
function placeChipSchematic(
  anchor: Chip,
  passives: TaggedPassive[],
  passiveNames: Set<string>,
): {
  blocks: PlacedBlock[]
  connections: PlacedConnection[]
  placed: Set<string>
} {
  // Same-side double passives force their two chip pins adjacent + spaced to
  // fit. The passive gap is only required between pins that actually carry a
  // passive; net-only / empty / broken pins just need room for two net labels,
  // so they pack tighter. The chip box grows from the summed spacing.
  const sidePairs = sameSidePairs(anchor, passives)
  const passivePins = new Set<string>()
  for (const { comp } of passives) {
    for (const e of pinEndpoints(comp)) {
      if (e.targetComp === anchor.name) passivePins.add(e.targetPin)
    }
  }
  const maxPassiveExtent = passives.reduce(
    (m, p) => Math.max(m, p.comp.schematicSize.defaultSchematicHeight),
    0,
  )
  const { pins: laidOutPins, size: chipSize } = layoutChipPins(
    anchor.pinPositions,
    anchor.schematicSize,
    sidePairs,
    {
      passivePins,
      passiveGap: maxPassiveExtent > 0 ? maxPassiveExtent + GAP_MINOR : 0,
      labelGap: LABEL_PIN_GAP,
    },
  )
  const chipPins = laidOutPins.map((p) => ({
    ...p,
    net: netOfPin(anchor, p.pin),
  }))
  const chipBlock: PlacedBlock = {
    type: "chip",
    name: anchor.name,
    x: 0,
    y: 0,
    width: chipSize.defaultSchematicWidth,
    height: chipSize.defaultSchematicHeight,
    rotation: 0,
    pins: chipPins,
  }

  const blocks: PlacedBlock[] = [chipBlock]
  const connections: PlacedConnection[] = []
  const placed = new Set<string>()
  // Keep-out regions: a chip-double passive reserves the channel between the
  // chip and its symbol (across its two pins) so later passives can't sit in
  // that y-band — leaving the channel clear for the trace solver.
  const reserved: Rect[] = []

  const chipName = anchor.name

  // Registry of every placed pin (chip + passives) and how many passives are
  // aligned to each, keyed "component.pin".
  const key = (comp: string, pin: string) => `${comp}.${pin}`
  const placedPins = new Map<string, PlacedPin>()
  const alignCount = new Map<string, number>()
  for (const p of chipPins) placedPins.set(key(chipName, p.pin), p)

  // Classify each passive and assign it to the first tier it matches.
  interface PInfo extends TaggedPassive {
    eps: PinEndpoint[]
    tier: number
  }
  const infos: PInfo[] = passives.map((tp) => {
    const eps = pinEndpoints(tp.comp)
    const cls: PassiveClass = {
      chipEndpoints: eps.filter((e) => e.targetComp === chipName).length,
      passiveEndpoints: eps.filter((e) => passiveNames.has(e.targetComp))
        .length,
    }
    return { ...tp, eps, tier: PASSIVE_TIERS.findIndex((t) => t.match(cls)) }
  })

  const align = (k: string) => alignCount.get(k) ?? 0

  /** Try to place one passive; returns false if it must wait for a neighbour. */
  function tryPlace(info: PInfo): boolean {
    const { type, comp, eps } = info
    const pw = comp.schematicSize.defaultSchematicWidth
    const ph = comp.schematicSize.defaultSchematicHeight

    const resolved = eps.map((e) => ({
      ...e,
      placedPin: placedPins.get(key(e.targetComp, e.targetPin)),
    }))
    const anchorable = resolved.filter(
      (r): r is typeof r & { placedPin: PlacedPin } => Boolean(r.placedPin),
    )
    if (anchorable.length === 0) return false // no placed endpoint yet

    // The parallel-edge double layouts only apply when BOTH endpoints are chip
    // pins. A double that touches a passive is laid out like a single (its
    // anchor pin faces the anchor); the other pin is wired across.
    const bothChip =
      eps.length === 2 &&
      anchorable.length === 2 &&
      eps.every((e) => e.targetComp === chipName)
    const sameSideDouble =
      bothChip && anchorable[0].placedPin.side === anchorable[1].placedPin.side

    // Anchor to the endpoint with the fewest passives already on it. Ties:
    // prefer the chip, then side (right, left, top, bottom), then pin order.
    const anchorEp = [...anchorable].sort(
      (a, b) =>
        align(key(a.targetComp, a.targetPin)) -
          align(key(b.targetComp, b.targetPin)) ||
        (a.targetComp === chipName ? 0 : 1) -
          (b.targetComp === chipName ? 0 : 1) ||
        SIDE_RANK[a.placedPin.side] - SIDE_RANK[b.placedPin.side] ||
        a.passivePin.localeCompare(b.passivePin),
    )[0]

    // chip+chip same-side double -> centre between the two pins; chip+chip
    // different-side double -> run parallel to the anchor edge; everything else
    // (single, or a double touching a passive) -> point the anchor pin at it.
    const g = sameSideDouble
      ? doubleCenteredGeometry(
          anchorable[0].placedPin.side,
          anchorable[0],
          anchorable[1],
          pw,
          ph,
        )
      : bothChip
        ? doublePassiveGeometry(
            anchorEp.placedPin.side,
            anchorEp.placedPin,
            anchorEp.passivePin,
            pw,
            ph,
          )
        : singlePassiveGeometry(
            anchorEp.placedPin.side,
            anchorEp.placedPin,
            anchorEp.passivePin,
            pw,
            ph,
          )
    const box: PlacedBlock = {
      type,
      name: comp.name,
      x: g.x,
      y: g.y,
      width: g.width,
      height: g.height,
      rotation: g.rotation,
      pins: [],
    }
    resolveCollision(box, [...blocks, ...reserved], g.axis, g.dir)
    box.pins = resolvePins(box.x, box.y, g.pins).map((p) => ({
      ...p,
      net: netOfPin(comp, p.pin),
    }))
    blocks.push(box)
    placed.add(comp.name)
    for (const p of box.pins) placedPins.set(key(comp.name, p.pin), p)
    // Centred doubles align to both pins; otherwise to the single anchor.
    const alignedEps = sameSideDouble ? anchorable : [anchorEp]
    for (const ep of alignedEps) {
      const ak = key(ep.targetComp, ep.targetPin)
      alignCount.set(ak, align(ak) + 1)
    }

    // A chip-double reserves the channel spanning its symbol and both chip
    // pins, so subsequent passives are pushed outside that y-band.
    if (bothChip) {
      const pts = [
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        ...anchorable.map((a) => a.placedPin),
      ]
      const xlo = Math.min(...pts.map((p) => p.x))
      const xhi = Math.max(...pts.map((p) => p.x))
      const ylo = Math.min(...pts.map((p) => p.y))
      const yhi = Math.max(...pts.map((p) => p.y))
      reserved.push({ x: xlo, y: ylo, width: xhi - xlo, height: yhi - ylo })
    }

    // Wire every already-placed endpoint. Inter-passive wires are drawn by
    // whichever of the pair is placed second, so each appears exactly once.
    for (const r of resolved) {
      if (!r.placedPin) continue
      const mine = box.pins.find((p) => p.pin === r.passivePin)
      if (mine) {
        connections.push({
          x1: mine.x,
          y1: mine.y,
          x2: r.placedPin.x,
          y2: r.placedPin.y,
        })
      }
    }
    return true
  }

  // Place tier by tier. Within a tier, iterate so a passive can wait for the
  // neighbour it anchors to. Passives that never anchor here are left unplaced.
  for (let tier = 0; tier < PASSIVE_TIERS.length; tier++) {
    let pending = infos.filter((i) => i.tier === tier)
    let progressed = true
    while (pending.length && progressed) {
      progressed = false
      const next: PInfo[] = []
      for (const info of pending) {
        if (tryPlace(info)) progressed = true
        else next.push(info)
      }
      pending = next
    }
  }

  return { blocks, connections, placed }
}

/** Lay leftover passives out in a simple row (no pins / wires). */
function rowSchematic(passives: TaggedPassive[]): Placement {
  const blocks: PlacedBlock[] = []
  let cursorX = 0
  for (const { type, comp } of passives) {
    const w = comp.schematicSize.defaultSchematicWidth
    blocks.push({
      type,
      name: comp.name,
      x: cursorX,
      y: 0,
      width: w,
      height: comp.schematicSize.defaultSchematicHeight,
      rotation: 0,
      pins: [],
    })
    cursorX += w + PASSIVE_GAP
  }
  return { blocks, connections: [] }
}

/** Gap between independent chip schematics when packed, in schematic units. */
const SCHEMATIC_GAP = 4
/** Schematics packed per row. */
const SCHEMATICS_PER_ROW = 3

function bbox(blocks: PlacedBlock[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  const xs = blocks.flatMap((b) => [b.x, b.x + b.width])
  const ys = blocks.flatMap((b) => [b.y, b.y + b.height])
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

/** Offset a schematic by (dx, dy). */
function shift(sub: Placement, dx: number, dy: number): Placement {
  return {
    blocks: sub.blocks.map((b) => ({
      ...b,
      x: b.x + dx,
      y: b.y + dy,
      pins: b.pins.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    })),
    connections: sub.connections.map((c) => ({
      x1: c.x1 + dx,
      y1: c.y1 + dy,
      x2: c.x2 + dx,
      y2: c.y2 + dy,
    })),
  }
}

/**
 * Row-based packing: SCHEMATICS_PER_ROW per row, gap between them. Within a row
 * the schematics are aligned along their midplane (vertically centred on the
 * row's centre line), not along their tops.
 */
function packSchematics(subs: Placement[]): Placement {
  const drawable = subs.filter((s) => s.blocks.length > 0)
  const blocks: PlacedBlock[] = []
  const connections: PlacedConnection[] = []
  let rowTop = 0
  for (let i = 0; i < drawable.length; i += SCHEMATICS_PER_ROW) {
    const row = drawable.slice(i, i + SCHEMATICS_PER_ROW)
    const boxes = row.map((s) => bbox(s.blocks))
    const rowHeight = Math.max(...boxes.map((b) => b.maxY - b.minY))
    const rowCenter = rowTop + rowHeight / 2
    let cursorX = 0
    for (let j = 0; j < row.length; j++) {
      const bb = boxes[j]
      const subCenter = bb.minY + (bb.maxY - bb.minY) / 2
      const moved = shift(row[j], cursorX - bb.minX, rowCenter - subCenter)
      blocks.push(...moved.blocks)
      connections.push(...moved.connections)
      cursorX += bb.maxX - bb.minX + SCHEMATIC_GAP
    }
    rowTop += rowHeight + SCHEMATIC_GAP
  }
  return { blocks, connections }
}

/** A solved chip schematic plus the metadata used for connectivity packing. */
interface Group {
  index: number
  chipName: string
  members: Set<string>
  placement: Placement
  pinCoord: Map<string, PlacedPin>
  priority: number
}

/** A pin-ref connection that crosses from group `a` into another group `b`. */
interface CrossEdge {
  a: number
  b: number
  fromKey: string
  toKey: string
  side: PinSide
}

const pinKey = (comp: string, pin: string) => `${comp}.${pin}`

const OPPOSITE: Record<PinSide, PinSide> = {
  left: "right",
  right: "left",
  top: "bottom",
  bottom: "top",
}
const STEP: Record<PinSide, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1],
}

/** Map each placed pin to its local coordinate, keyed "component.pin". */
function groupPinCoords(placement: Placement): Map<string, PlacedPin> {
  const m = new Map<string, PlacedPin>()
  for (const b of placement.blocks) {
    for (const p of b.pins) m.set(pinKey(b.name, p.pin), p)
  }
  return m
}

/** Directed pin-ref edges that cross from one group into another. */
function buildCrossEdges(
  groups: Group[],
  compByName: Map<string, { connections: Connections }>,
): CrossEdge[] {
  const memberToGroup = new Map<string, number>()
  for (const g of groups) {
    for (const m of g.members) memberToGroup.set(m, g.index)
  }
  const edges: CrossEdge[] = []
  const seen = new Set<string>()
  for (const g of groups) {
    for (const member of g.members) {
      const comp = compByName.get(member)
      if (!comp) continue
      for (const ep of pinEndpoints(comp)) {
        const target = memberToGroup.get(ep.targetComp)
        if (target === undefined || target === g.index) continue
        const fromKey = pinKey(member, ep.passivePin)
        const toKey = pinKey(ep.targetComp, ep.targetPin)
        if (seen.has(`${fromKey}->${toKey}`)) continue
        seen.add(`${fromKey}->${toKey}`)
        const fromPin = g.pinCoord.get(fromKey)
        if (!fromPin) continue
        edges.push({
          a: g.index,
          b: target,
          fromKey,
          toKey,
          side: fromPin.side,
        })
      }
    }
  }
  return edges
}

/** Partition group indices into connected components (edges are undirected here). */
function connectedComponents(groups: Group[], edges: CrossEdge[]): number[][] {
  const parent = groups.map((_, i) => i)
  const find = (i: number): number =>
    parent[i] === i ? i : (parent[i] = find(parent[i]))
  for (const e of edges) parent[find(e.a)] = find(e.b)
  const comps = new Map<number, number[]>()
  for (let i = 0; i < groups.length; i++) {
    const root = find(i)
    const list = comps.get(root) ?? []
    list.push(i)
    comps.set(root, list)
  }
  return [...comps.values()]
}

/**
 * Lay out a connected component of chip groups on a 2D grid driven by the
 * cross-chip pin connections. A group reached from A along an edge whose exit
 * side is `s` is placed in the `s` direction from A (left/right/top/bottom),
 * stepping further if that cell is taken. Cells become coordinates by per-row
 * height / per-column width, each group centred in its cell (midplane both
 * axes). Cross-chip wires are then drawn between the bridged pins.
 */
function gridPlaceComponent(
  indices: number[],
  groups: Group[],
  edges: CrossEdge[],
): Placement {
  // A lone group keeps its native coordinates (preserves single-chip layout).
  if (indices.length === 1) return groups[indices[0]].placement

  const inComp = new Set(indices)
  const compEdges = edges.filter((e) => inComp.has(e.a) && inComp.has(e.b))
  const cell = new Map<number, { c: number; r: number }>()
  const occupied = new Map<string, number>()
  const queue: number[] = []

  const place = (idx: number, c: number, r: number) => {
    cell.set(idx, { c, r })
    occupied.set(`${c},${r}`, idx)
    queue.push(idx)
  }
  const placeDir = (
    idx: number,
    from: { c: number; r: number },
    side: PinSide,
  ) => {
    const [dc, dr] = STEP[side]
    let c = from.c + dc
    let r = from.r + dr
    while (occupied.has(`${c},${r}`)) {
      c += dc
      r += dr
    }
    place(idx, c, r)
  }

  // Seed with the highest-priority group, then BFS the rest of the component.
  const order = [...indices].sort(
    (x, y) => groups[y].priority - groups[x].priority,
  )
  for (const seed of order) {
    if (cell.has(seed)) continue
    let r = 0
    while (occupied.has(`0,${r}`)) r++
    place(seed, 0, r)
    while (queue.length) {
      const cur = queue.shift() as number
      const at = cell.get(cur) as { c: number; r: number }
      for (const e of compEdges) {
        if (e.a === cur && !cell.has(e.b)) placeDir(e.b, at, e.side)
        else if (e.b === cur && !cell.has(e.a))
          placeDir(e.a, at, OPPOSITE[e.side])
      }
    }
  }

  // Normalize cells, then size columns / rows.
  const cells = indices.map((i) => cell.get(i) as { c: number; r: number })
  const minC = Math.min(...cells.map((p) => p.c))
  const minR = Math.min(...cells.map((p) => p.r))
  const boxes = indices.map((i) => bbox(groups[i].placement.blocks))
  const colWidth = new Map<number, number>()
  const rowHeight = new Map<number, number>()
  indices.forEach((_, k) => {
    const c = cells[k].c - minC
    const r = cells[k].r - minR
    const w = boxes[k].maxX - boxes[k].minX
    const h = boxes[k].maxY - boxes[k].minY
    colWidth.set(c, Math.max(colWidth.get(c) ?? 0, w))
    rowHeight.set(r, Math.max(rowHeight.get(r) ?? 0, h))
  })
  const colX = new Map<number, number>()
  const rowY = new Map<number, number>()
  let x = 0
  for (const c of [...colWidth.keys()].sort((a, b) => a - b)) {
    colX.set(c, x)
    x += (colWidth.get(c) as number) + SCHEMATIC_GAP
  }
  let y = 0
  for (const r of [...rowHeight.keys()].sort((a, b) => a - b)) {
    rowY.set(r, y)
    y += (rowHeight.get(r) as number) + SCHEMATIC_GAP
  }

  // Shift each group into its cell (centred), collecting blocks + a pin map.
  const blocks: PlacedBlock[] = []
  const connections: PlacedConnection[] = []
  const globalPins = new Map<string, PlacedPin>()
  indices.forEach((i, k) => {
    const c = cells[k].c - minC
    const r = cells[k].r - minR
    const bb = boxes[k]
    const cw = colWidth.get(c) as number
    const ch = rowHeight.get(r) as number
    const dx =
      (colX.get(c) as number) + (cw - (bb.maxX - bb.minX)) / 2 - bb.minX
    const dy =
      (rowY.get(r) as number) + (ch - (bb.maxY - bb.minY)) / 2 - bb.minY
    const moved = shift(groups[i].placement, dx, dy)
    blocks.push(...moved.blocks)
    connections.push(...moved.connections)
    for (const b of moved.blocks) {
      for (const p of b.pins) globalPins.set(pinKey(b.name, p.pin), p)
    }
  })

  // Draw the cross-chip wires now that both ends share this space.
  for (const e of compEdges) {
    const from = globalPins.get(e.fromKey)
    const to = globalPins.get(e.toKey)
    if (from && to) {
      connections.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y })
    }
  }
  return { blocks, connections }
}

/**
 * Solve the whole schematic. Chips are placed independently (descending
 * connection count), skipping passives an earlier chip already consumed. Chips
 * joined by cross-chip pin connections form a component laid out on a 2D grid
 * by connection direction; the resulting component schematics are row-packed.
 */
export function solveSchematic(ast: SchematicAst): Placement {
  const chips = [...ast.chips].sort(
    (a, b) => connectionCount(b) - connectionCount(a),
  )
  if (chips.length === 0) {
    return { blocks: placeSequentially(ast), connections: [] }
  }

  const allPassives: TaggedPassive[] = PASSIVE_PRECEDENCE.flatMap(
    ({ type, select }) => select(ast).map((comp) => ({ type, comp })),
  )
  const passiveNames = new Set(allPassives.map((p) => p.comp.name))
  const compByName = new Map<string, { connections: Connections }>()
  for (const c of ast.chips) compByName.set(c.name, c)
  for (const r of ast.resistors) compByName.set(r.name, r)
  for (const c of ast.capacitors) compByName.set(c.name, c)

  const placedGlobal = new Set<string>()
  const groups: Group[] = []
  for (const chip of chips) {
    const avail = allPassives.filter((p) => !placedGlobal.has(p.comp.name))
    const sub = placeChipSchematic(chip, avail, passiveNames)
    for (const n of sub.placed) placedGlobal.add(n)
    const placement: Placement = {
      blocks: sub.blocks,
      connections: sub.connections,
    }
    groups.push({
      index: groups.length,
      chipName: chip.name,
      members: new Set([chip.name, ...sub.placed]),
      placement,
      pinCoord: groupPinCoords(placement),
      priority: connectionCount(chip),
    })
  }

  const edges = buildCrossEdges(groups, compByName)
  const components = connectedComponents(groups, edges)
  const placements: Placement[] = components.map((c) =>
    gridPlaceComponent(c, groups, edges),
  )

  // Passives no chip could place (e.g. net-only) become a trailing row.
  const leftover = allPassives.filter((p) => !placedGlobal.has(p.comp.name))
  if (leftover.length) placements.push(rowSchematic(leftover))

  if (placements.length === 1) return placements[0]
  return packSchematics(placements)
}
