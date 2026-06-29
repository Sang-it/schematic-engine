import type { PinSide, SchematicAst } from "@schematic-engine/core"
import {
  type BlockType,
  solveSchematic,
} from "@schematic-engine/placement-solver"
import { solveTraces } from "./route"
import type { RoutedSchematic } from "./types"

/** Pixels per schematic unit. */
const SCALE = 20
/** Padding around the drawing, in pixels. */
const PAD = 12

const COLORS: Record<BlockType, string> = {
  chip: "#f5e6a8",
  resistor: "#f0b4b4",
  capacitor: "#b4c8f0",
}

const FONT_SIZE = 3
const PIN_FONT_SIZE = 2.5
const LABEL_FONT_SIZE = 3
const PIN_DOT_R = 1.5
const NUM_INSET = 3
/** Distance the net label centre sits outside the pin, in pixels. */
const LABEL_OUT = 6
/** Side length of the square net-label box, in pixels. */
const LABEL_BOX = 6

function fmt(n: number): string {
  return String(Number(n.toFixed(3)))
}

function pinNumber(id: string): string {
  const m = /(\d+)/.exec(id)
  return m ? m[1] : id
}

const labelWidth = (text: string) =>
  Math.max(LABEL_BOX, text.length * LABEL_FONT_SIZE * 0.7 + 2)

/** Render a routed schematic (blocks, traces, net labels) to a stable SVG. */
export function renderRoutedSvg(routed: RoutedSchematic): string {
  const { blocks, traces, labels } = routed

  // Pins already directly connected (trace endpoint / broken label) show only
  // that connection, so they get no net label.
  const direct = new Set<string>()
  for (const t of traces) {
    const ends = [t.points[0], t.points[t.points.length - 1]]
    for (const p of ends) direct.add(`${p.x},${p.y}`)
  }
  for (const l of labels) direct.add(`${l.x},${l.y}`)

  // All boxed labels (unit coords): net names on net-only pins + broken numbers.
  const labelEntries: { x: number; y: number; side: PinSide; text: string }[] =
    []
  for (const b of blocks) {
    for (const p of b.pins) {
      if (p.net !== undefined && !direct.has(`${p.x},${p.y}`)) {
        labelEntries.push({ x: p.x, y: p.y, side: p.side, text: p.net })
      }
    }
  }
  for (const l of labels) {
    labelEntries.push({ x: l.x, y: l.y, side: l.side, text: l.label })
  }

  const xs: number[] = []
  const ys: number[] = []
  for (const b of blocks) {
    xs.push(b.x, b.x + b.width)
    ys.push(b.y, b.y + b.height)
    for (const p of b.pins) {
      xs.push(p.x)
      ys.push(p.y)
    }
  }
  for (const t of traces) {
    for (const p of t.points) {
      xs.push(p.x)
      ys.push(p.y)
    }
  }
  for (const e of labelEntries) {
    xs.push(e.x)
    ys.push(e.y)
  }
  const minX = xs.length ? Math.min(...xs) : 0
  const minY = ys.length ? Math.min(...ys) : 0
  const maxX = xs.length ? Math.max(...xs) : 0
  const maxY = ys.length ? Math.max(...ys) : 0

  // Pad enough that the longest label (reaching outward) stays in view.
  const maxLabel = labelEntries.reduce(
    (m, e) => Math.max(m, labelWidth(e.text)),
    0,
  )
  const pad = Math.max(PAD, LABEL_OUT + maxLabel + 2)

  const X = (u: number) => pad + (u - minX) * SCALE
  const Y = (u: number) => pad + (u - minY) * SCALE
  const width = (maxX - minX) * SCALE + pad * 2
  const height = (maxY - minY) * SCALE + pad * 2

  // Traces first so they sit under the symbols. Solid blue polylines.
  const wires = traces.map((t) => {
    const pts = t.points.map((p) => `${fmt(X(p.x))},${fmt(Y(p.y))}`).join(" ")
    return `  <polyline points="${pts}" fill="none" stroke="blue" stroke-width="1" />`
  })

  const symbols = blocks.map((b) => {
    const x = X(b.x)
    const y = Y(b.y)
    const bw = b.width * SCALE
    const bh = b.height * SCALE
    const cx = x + bw / 2
    const cy = y + bh / 2

    const pinEls: string[] = []
    for (const p of b.pins) {
      const px = X(p.x)
      const py = Y(p.y)
      let nx = px
      let ny = py
      if (p.side === "left") nx = px + NUM_INSET
      else if (p.side === "right") nx = px - NUM_INSET
      else if (p.side === "top") ny = py + NUM_INSET
      else ny = py - NUM_INSET
      pinEls.push(
        `  <circle cx="${fmt(px)}" cy="${fmt(py)}" r="${fmt(PIN_DOT_R)}" fill="black" />`,
      )
      pinEls.push(
        `  <text x="${fmt(nx)}" y="${fmt(ny)}" font-family="sans-serif" font-size="${PIN_FONT_SIZE}" text-anchor="middle" dominant-baseline="middle">${pinNumber(p.pin)}</text>`,
      )
    }

    return [
      `  <rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(bw)}" height="${fmt(bh)}" fill="${COLORS[b.type]}" stroke="black" stroke-width="1" />`,
      ...pinEls,
      `  <text x="${fmt(cx)}" y="${fmt(cy)}" font-family="sans-serif" font-size="${FONT_SIZE}" text-anchor="middle" dominant-baseline="middle">${b.name}</text>`,
    ].join("\n")
  })

  // A bordered box just outside a pin holding label text, so it reads as a
  // label. Left/right pins get a horizontal box; top/bottom pins get a vertical
  // (rotated) box, so the along-edge width is always constant.
  const boxedLabel = (
    px: number,
    py: number,
    side: PinSide,
    text: string,
  ): string[] => {
    const bw = labelWidth(text)
    if (side === "left" || side === "right") {
      const lx =
        side === "left" ? px - LABEL_OUT - bw / 2 : px + LABEL_OUT + bw / 2
      return [
        `  <rect x="${fmt(lx - bw / 2)}" y="${fmt(py - LABEL_BOX / 2)}" width="${fmt(bw)}" height="${fmt(LABEL_BOX)}" rx="1" fill="white" stroke="black" stroke-width="0.5" />`,
        `  <text x="${fmt(lx)}" y="${fmt(py)}" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${text}</text>`,
      ]
    }
    // Vertical: long axis runs outward, short (constant) axis along the edge.
    const ly =
      side === "top" ? py - LABEL_OUT - bw / 2 : py + LABEL_OUT + bw / 2
    return [
      `  <rect x="${fmt(px - LABEL_BOX / 2)}" y="${fmt(ly - bw / 2)}" width="${fmt(LABEL_BOX)}" height="${fmt(bw)}" rx="1" fill="white" stroke="black" stroke-width="0.5" />`,
      `  <text x="${fmt(px)}" y="${fmt(ly)}" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${fmt(px)} ${fmt(ly)})">${text}</text>`,
    ]
  }

  const netLabels = labelEntries.flatMap((e) =>
    boxedLabel(X(e.x), Y(e.y), e.side, e.text),
  )

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    ...wires,
    ...symbols,
    ...netLabels,
    "</svg>",
    "",
  ].join("\n")
}

/** Convenience: solve placement, route traces, and render to SVG. */
export function astToRoutedSvg(ast: SchematicAst): string {
  return renderRoutedSvg(solveTraces(solveSchematic(ast)))
}
