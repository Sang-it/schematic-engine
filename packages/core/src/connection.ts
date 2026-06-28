import type { ComponentType, ConnectionTarget } from "./types"

const COMPONENT_TYPES: readonly string[] = [
  "chip",
  "resistor",
  "capacitor",
  "net",
]

function isComponentType(s: string): s is ComponentType {
  return COMPONENT_TYPES.includes(s)
}

function isPinId(s: string): boolean {
  return /^pin\d+$/.test(s)
}

/**
 * Parse a connection string into a structured target. Dot-separated segments,
 * optional leading component type. The final pin segment may be a pin id
 * ("pin2") or a named pin / label ("SDA") — the latter only when the target
 * carries an explicit component-type prefix.
 *
 *   "VCC"                  -> net "VCC"
 *   "net.VCC"              -> net "VCC"
 *   "R1.pin2"              -> pin "pin2" of "R1"
 *   "resistor.R1.pin2"     -> pin "pin2" of resistor "R1"
 *   "resistor.R1.SDA"      -> named pin "SDA" of resistor "R1"
 */
export function parseConnectionTarget(raw: string): ConnectionTarget {
  const segments = raw
    .split(".")
    .map((s) => s.trim())
    .filter(Boolean)

  if (segments.length === 0) {
    return { kind: "net", name: raw.trim() }
  }

  let componentType: ComponentType | undefined
  let parts = segments
  if (isComponentType(segments[0])) {
    componentType = segments[0]
    parts = segments.slice(1)
  }

  // Explicit net target: "net.NAME" (nets have no pins).
  if (componentType === "net") {
    return { kind: "net", name: parts.join(".") }
  }

  // Pin target: [type.] component . pin
  // With an explicit type the final segment is always the pin (id or label).
  // Without a type we only treat it as a pin when the final segment is a pinId.
  const last = parts[parts.length - 1]
  if (parts.length >= 2 && last && (componentType || isPinId(last))) {
    return {
      kind: "pin",
      componentType,
      component: parts.slice(0, -1).join("."),
      pin: last,
    }
  }

  // Otherwise treat the whole thing as a net name.
  return { kind: "net", name: parts.join(".") }
}
