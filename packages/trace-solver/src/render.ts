import type { SchematicAst } from "@schematic-engine/core"
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
/** Distance the net label sits outside the pin, in pixels. */
const LABEL_OUT = 5

function fmt(n: number): string {
  return String(Number(n.toFixed(3)))
}

function pinNumber(id: string): string {
  const m = /(\d+)/.exec(id)
  return m ? m[1] : id
}

/** Render a routed schematic (blocks, traces, net labels) to a stable SVG. */
export function renderRoutedSvg(routed: RoutedSchematic): string {
  const { blocks, traces, labels } = routed

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
  for (const l of labels) {
    xs.push(l.x)
    ys.push(l.y)
  }
  const minX = xs.length ? Math.min(...xs) : 0
  const minY = ys.length ? Math.min(...ys) : 0
  const maxX = xs.length ? Math.max(...xs) : 0
  const maxY = ys.length ? Math.max(...ys) : 0

  const X = (u: number) => PAD + (u - minX) * SCALE
  const Y = (u: number) => PAD + (u - minY) * SCALE
  const width = (maxX - minX) * SCALE + PAD * 2
  const height = (maxY - minY) * SCALE + PAD * 2

  // Traces first so they sit under the symbols. Solid black polylines.
  const wires = traces.map((t) => {
    const pts = t.points.map((p) => `${fmt(X(p.x))},${fmt(Y(p.y))}`).join(" ")
    return `  <polyline points="${pts}" fill="none" stroke="black" stroke-width="1" />`
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

  // Net labels: the number drawn just outside the pin along its side.
  const netLabels = labels.map((l) => {
    let lx = X(l.x)
    let ly = Y(l.y)
    if (l.side === "left") lx -= LABEL_OUT
    else if (l.side === "right") lx += LABEL_OUT
    else if (l.side === "top") ly -= LABEL_OUT
    else ly += LABEL_OUT
    return `  <text x="${fmt(lx)}" y="${fmt(ly)}" font-family="sans-serif" font-size="${LABEL_FONT_SIZE}" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${l.label}</text>`
  })

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
