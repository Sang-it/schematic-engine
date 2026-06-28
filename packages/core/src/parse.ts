import { parse as babelParse } from "@babel/parser"
import type {
  JSXElement,
  JSXAttribute,
  JSXOpeningElement,
  Expression,
  Node,
} from "@babel/types"
import type {
  Connections,
  Pins,
  PinId,
  PinSides,
  SchematicIR,
  SchematicSize,
} from "./types"
import { DEFAULT_SCHEMATIC_SIZE } from "./types"
import { parseConnectionTarget } from "./connection"
import { chipPinPositions, defaultTwoPinPositions } from "./pins"

const KNOWN_TAGS = ["chip", "resistor", "capacitor", "net", "trace"] as const
type KnownTag = (typeof KNOWN_TAGS)[number]

function tagName(opening: JSXOpeningElement): string | null {
  const n = opening.name
  return n.type === "JSXIdentifier" ? n.name : null
}

/** Coerce a simple literal expression to a string. */
function exprToString(e: Expression): string | null {
  if (e.type === "StringLiteral") return e.value
  if (e.type === "NumericLiteral") return String(e.value)
  if (e.type === "TemplateLiteral" && e.quasis.length === 1) {
    return e.quasis[0].value.cooked ?? null
  }
  return null
}

/** Read a JSX attribute value as a string. Supports `foo="bar"` and `foo={"bar"}`. */
function attrValue(attr: JSXAttribute): string | null {
  const v = attr.value
  if (!v) return null // bare attribute like `<net standalone />`
  if (v.type === "StringLiteral") return v.value
  if (v.type === "JSXExpressionContainer") {
    return exprToString(v.expression as Expression)
  }
  return null
}

/**
 * Read a `connections={{ pin1: "net.A", ... }}` object attribute into a flat
 * key -> string map. Returns null if the attribute isn't an object literal.
 */
function connectionsObject(attr: JSXAttribute): Record<string, string> | null {
  const v = attr.value
  if (!v || v.type !== "JSXExpressionContainer") return null
  const e = v.expression
  if (e.type !== "ObjectExpression") return null
  const out: Record<string, string> = {}
  for (const prop of e.properties) {
    if (prop.type !== "ObjectProperty") continue // skip spreads/methods
    let key: string | null = null
    if (prop.key.type === "Identifier") key = prop.key.name
    else if (prop.key.type === "StringLiteral") key = prop.key.value
    if (!key) continue
    const value = exprToString(prop.value as Expression)
    if (value !== null) out[key] = value
  }
  return out
}

const PIN_RE = /^pin\d+$/
const SIDE_KEYS = ["top", "left", "right", "bottom"] as const

/**
 * Read a `pinPosition={{ left: ["pin1"], right: ["pin2", "pin3"] }}` attribute
 * into side -> pin-id-array. Returns null if it isn't such an object.
 */
function pinSidesObject(attr: JSXAttribute): PinSides | null {
  const v = attr.value
  if (!v || v.type !== "JSXExpressionContainer") return null
  const e = v.expression
  if (e.type !== "ObjectExpression") return null
  const out: PinSides = {}
  for (const prop of e.properties) {
    if (prop.type !== "ObjectProperty") continue
    let key: string | null = null
    if (prop.key.type === "Identifier") key = prop.key.name
    else if (prop.key.type === "StringLiteral") key = prop.key.value
    if (!key || !(SIDE_KEYS as readonly string[]).includes(key)) continue
    if (prop.value.type !== "ArrayExpression") continue
    const ids: string[] = []
    for (const el of prop.value.elements) {
      if (el && el.type === "StringLiteral") ids.push(el.value)
    }
    out[key as (typeof SIDE_KEYS)[number]] = ids
  }
  return out
}

/**
 * Collect a component element's `name`, declared pin labels, raw connection
 * strings, and optional pin-side assignment. Connections come from
 * `connections={{...}}` (or legacy flat `pinN="..."` attrs); pin labels from
 * `pins={{...}}`; side assignment from `pinPosition={{...}}`.
 */
function readAttrs(opening: JSXOpeningElement): {
  name: string | undefined
  pinLabels: Record<string, string>
  conns: Record<string, string>
  raw: Record<string, string>
  pinSides: PinSides | undefined
} {
  let name: string | undefined
  const pinLabels: Record<string, string> = {}
  const conns: Record<string, string> = {}
  const raw: Record<string, string> = {}
  let pinSides: PinSides | undefined
  for (const attr of opening.attributes) {
    if (attr.type !== "JSXAttribute") continue // skip spread attrs
    if (attr.name.type !== "JSXIdentifier") continue
    const key = attr.name.name

    // `connections={{ pin1: "net.A", ... }}` object form.
    if (key === "connections") {
      const obj = connectionsObject(attr)
      if (obj) Object.assign(conns, obj)
      continue
    }

    // `pins={{ pin1: "SDA", ... }}` declared pin labels.
    if (key === "pins") {
      const obj = connectionsObject(attr)
      if (obj) Object.assign(pinLabels, obj)
      continue
    }

    // `pinPosition={{ left: [...], right: [...] }}` side assignment.
    if (key === "pinPosition") {
      const obj = pinSidesObject(attr)
      if (obj) pinSides = obj
      continue
    }

    const value = attrValue(attr)
    if (value === null) continue
    if (key === "name") {
      name = value
    } else {
      raw[key] = value // e.g. trace from/to
      if (PIN_RE.test(key)) conns[key] = value // legacy flat pin attr
    }
  }
  return { name, pinLabels, conns, raw, pinSides }
}

/** Build the typed pins (labels) and parsed connections for a component. */
function pinsAndConnections(
  pinLabels: Record<string, string>,
  conns: Record<string, string>,
): { pins: Pins; connections: Connections } {
  const pins: Pins = {}
  for (const [key, value] of Object.entries(pinLabels)) {
    if (PIN_RE.test(key)) pins[key as PinId] = value
  }
  const connections: Connections = {}
  for (const [key, value] of Object.entries(conns)) {
    if (PIN_RE.test(key))
      connections[key as PinId] = parseConnectionTarget(value)
  }
  return { pins, connections }
}

/** All pin ids referenced by a chip: connections, labels, and side assignment. */
function chipPinIds(
  pins: Pins,
  connections: Connections,
  pinSides: PinSides | undefined,
): string[] {
  const ids = new Set<string>()
  for (const k of Object.keys(connections)) ids.add(k)
  for (const k of Object.keys(pins)) ids.add(k)
  if (pinSides) {
    for (const side of [
      pinSides.top,
      pinSides.left,
      pinSides.right,
      pinSides.bottom,
    ]) {
      for (const id of side ?? []) if (PIN_RE.test(id)) ids.add(id)
    }
  }
  return [...ids]
}

/**
 * Resolve a component's schematic size: the per-type default, with optional
 * numeric overrides from `schematicWidth` / `schematicHeight` attributes.
 */
function schematicSize(
  tag: "chip" | "resistor" | "capacitor",
  raw: Record<string, string>,
): SchematicSize {
  const def = DEFAULT_SCHEMATIC_SIZE[tag]
  const w = Number(raw.schematicWidth)
  const h = Number(raw.schematicHeight)
  return {
    defaultSchematicWidth: Number.isFinite(w) ? w : def.defaultSchematicWidth,
    defaultSchematicHeight: Number.isFinite(h) ? h : def.defaultSchematicHeight,
  }
}

/** Walk the parsed program and collect every top-level JSX element. */
function collectJsxElements(ast: Node): JSXElement[] {
  const out: JSXElement[] = []
  const visit = (node: Node | null | undefined) => {
    if (!node || typeof node !== "object") return
    if ((node as Node).type === "JSXElement") {
      out.push(node as JSXElement)
      // Also descend into children (nested elements are still collected).
    }
    for (const key of Object.keys(node)) {
      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const c of child) if (c && typeof c.type === "string") visit(c)
      } else if (child && typeof child.type === "string") {
        visit(child)
      }
    }
  }
  visit(ast)
  return out
}

/**
 * Parse a tscircuit JSX subset into the intermediate representation
 * (grouped by element type, traces still separate).
 */
export function parse(code: string): SchematicIR {
  // Wrap in a fragment so multiple sibling top-level elements parse as one
  // expression (adjacent JSX elements are not a valid program otherwise).
  const file = babelParse(`<>${code}</>`, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  })

  const result: SchematicIR = {
    chips: [],
    resistors: [],
    capacitors: [],
    nets: [],
    traces: [],
  }

  for (const el of collectJsxElements(file.program)) {
    const tag = tagName(el.openingElement)
    if (!tag || !KNOWN_TAGS.includes(tag as KnownTag)) continue
    const { name, pinLabels, conns, raw, pinSides } = readAttrs(
      el.openingElement,
    )

    switch (tag as KnownTag) {
      case "chip": {
        const { pins, connections } = pinsAndConnections(pinLabels, conns)
        const size = schematicSize("chip", raw)
        const pinIds = chipPinIds(pins, connections, pinSides)
        result.chips.push({
          name: name ?? "",
          pins,
          connections,
          schematicSize: size,
          pinPositions: chipPinPositions(pinIds, pinSides),
        })
        break
      }
      case "resistor": {
        const { pins, connections } = pinsAndConnections(pinLabels, conns)
        const size = schematicSize("resistor", raw)
        result.resistors.push({
          name: name ?? "",
          pins,
          connections,
          schematicSize: size,
          pinPositions: defaultTwoPinPositions(),
        })
        break
      }
      case "capacitor": {
        const { pins, connections } = pinsAndConnections(pinLabels, conns)
        const size = schematicSize("capacitor", raw)
        result.capacitors.push({
          name: name ?? "",
          pins,
          connections,
          schematicSize: size,
          pinPositions: defaultTwoPinPositions(),
        })
        break
      }
      case "net":
        result.nets.push({ name: name ?? "" })
        break
      case "trace":
        result.traces.push({
          name,
          from: raw.from ? parseConnectionTarget(raw.from) : undefined,
          to: raw.to ? parseConnectionTarget(raw.to) : undefined,
        })
        break
    }
  }

  return result
}
