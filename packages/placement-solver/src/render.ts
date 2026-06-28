import type { SchematicAst } from "@schematic-engine/core"
import { solveSchematic } from "./solve"
import type { BlockType, Placement } from "./types"

/** Pixels per schematic unit. */
const SCALE = 20
/** Padding around the drawing, in pixels (>= PIN_LEN so stubs stay in view). */
const PAD = 12

/** Softer pastel tones instead of fully saturated yellow/red/blue. */
const COLORS: Record<BlockType, string> = {
  chip: "#f5e6a8", // soft yellow
  resistor: "#f0b4b4", // soft red
  capacitor: "#b4c8f0", // soft blue
}

/** Font size for block name labels, in pixels. */
const FONT_SIZE = 3
/** Font size for pin number labels, in pixels. */
const PIN_FONT_SIZE = 2.5
/** Radius of the pin dot drawn on the boundary, in pixels. */
const PIN_DOT_R = 1.5
/** Inset of the pin number from the boundary, in pixels. */
const NUM_INSET = 3

/** Trim float noise so the SVG output is stable across runs. */
function fmt(n: number): string {
  return String(Number(n.toFixed(3)))
}

/** The numeric part of a pin id ("pin12" -> "12"). */
function pinNumber(id: string): string {
  const m = /(\d+)/.exec(id)
  return m ? m[1] : id
}

/** Render a full placement to a deterministic SVG string. */
export function renderSchematicSvg(placement: Placement): string {
  const { blocks, connections } = placement

  // Bounds in schematic units (blocks may sit at negative coordinates).
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
  for (const c of connections) {
    xs.push(c.x1, c.x2)
    ys.push(c.y1, c.y2)
  }
  const minX = xs.length ? Math.min(...xs) : 0
  const minY = ys.length ? Math.min(...ys) : 0
  const maxX = xs.length ? Math.max(...xs) : 0
  const maxY = ys.length ? Math.max(...ys) : 0

  const X = (u: number) => PAD + (u - minX) * SCALE
  const Y = (u: number) => PAD + (u - minY) * SCALE
  const width = (maxX - minX) * SCALE + PAD * 2
  const height = (maxY - minY) * SCALE + PAD * 2

  // Connections first so they sit underneath the symbols. Transparent line.
  const wires = connections.map(
    (c) =>
      `  <line x1="${fmt(X(c.x1))}" y1="${fmt(Y(c.y1))}" x2="${fmt(X(c.x2))}" y2="${fmt(Y(c.y2))}" stroke="black" stroke-opacity="0.25" stroke-width="1" />`,
  )

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
      // Number sits just inside the boundary, opposite the dot's edge.
      let nx = px
      let ny = py
      if (p.side === "left") nx = px + NUM_INSET
      else if (p.side === "right") nx = px - NUM_INSET
      else if (p.side === "top") ny = py + NUM_INSET
      else ny = py - NUM_INSET
      // Pin marker: a dot on the boundary.
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

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}">`,
    ...wires,
    ...symbols,
    "</svg>",
    "",
  ].join("\n")
}

/** Convenience: solve placement for an AST and render it to SVG. */
export function astToSchematicSvg(ast: SchematicAst): string {
  return renderSchematicSvg(solveSchematic(ast))
}
