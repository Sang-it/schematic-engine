/**
 * AST produced by parsing a simple tscircuit JSX subset.
 *
 * Supported top-level elements (all have a `name`):
 *   <chip />      <resistor />   <capacitor />   <net />   <trace />
 */

/** A pin identifier, e.g. "pin1", "pin2", ... */
export type PinId = `pin${number}`

/** Known component-type keywords usable as a prefix in a connection string. */
export type ComponentType = "chip" | "resistor" | "capacitor" | "net"

/**
 * A parsed connection target. Connection strings look like one of:
 *   "VCC"            -> net "VCC"
 *   "net.VCC"        -> net "VCC"
 *   "U1.pin3"        -> pin "pin3" of component "U1"
 *   "chip.U1.pin3"   -> pin "pin3" of chip "U1" (explicit component type)
 */
export type ConnectionTarget =
  | { kind: "net"; name: string }
  | {
      kind: "pin"
      /** Present only when the string carried an explicit type prefix. */
      componentType?: ComponentType
      component: string
      /** Pin id ("pin2") or a named pin / label ("SDA"). */
      pin: PinId | string
    }

/** Declared pin labels of a component: pin id -> human pin name (e.g. "SDA"). */
export type Pins = Partial<Record<PinId, string>>

/** Parsed connections: pin id -> resolved target. */
export type Connections = Partial<Record<PinId, ConnectionTarget>>

/**
 * Default size of a component's schematic symbol, in schematic units. The
 * actual placed size can grow (e.g. to fit passives / pin spacing), so these
 * fields are the defaults.
 */
export interface SchematicSize {
  defaultSchematicWidth: number
  defaultSchematicHeight: number
}

/** Default schematic symbol sizes per component type. */
export const DEFAULT_SCHEMATIC_SIZE: {
  chip: SchematicSize
  resistor: SchematicSize
  capacitor: SchematicSize
} = {
  chip: { defaultSchematicWidth: 4, defaultSchematicHeight: 8 },
  resistor: { defaultSchematicWidth: 1, defaultSchematicHeight: 0.5 },
  capacitor: { defaultSchematicWidth: 1, defaultSchematicHeight: 0.5 },
}

/** Which boundary edge a pin sits on. */
export type PinSide = "top" | "left" | "right" | "bottom"

/**
 * Chip `pinPosition` prop: assigns pin ids to boundary sides.
 *   pinPosition={{ left: ["pin1", "pin2"], right: ["pin3"] }}
 */
export interface PinSides {
  top?: string[]
  left?: string[]
  right?: string[]
  bottom?: string[]
}

/**
 * A pin's placement on the component boundary: which side it sits on. The
 * concrete x/y coordinate is computed downstream (in the placement solver)
 * from the side, the pin's order within `pinPositions`, and the component
 * size. Pins are ordered top->down on vertical sides (left/right) and
 * left->right on horizontal sides (top/bottom).
 */
export interface PinPosition {
  pin: string
  side: PinSide
}

export interface Chip {
  name: string
  pins: Pins
  connections: Connections
  schematicSize: SchematicSize
  pinPositions: PinPosition[]
}

export interface Resistor {
  name: string
  /** pin1 = positive terminal, pin2 = negative terminal (implicit). */
  pins: Pins
  connections: Connections
  schematicSize: SchematicSize
  pinPositions: PinPosition[]
}

export interface Capacitor {
  name: string
  /** pin1 = positive terminal, pin2 = negative terminal (implicit). */
  pins: Pins
  connections: Connections
  schematicSize: SchematicSize
  pinPositions: PinPosition[]
}

export interface Net {
  name: string
}

export interface Trace {
  name?: string
  from?: ConnectionTarget
  to?: ConnectionTarget
}

/**
 * Intermediate representation produced directly by the JSX parser.
 * Traces are still separate elements here.
 */
export interface SchematicIR {
  chips: Chip[]
  resistors: Resistor[]
  capacitors: Capacitor[]
  nets: Net[]
  traces: Trace[]
}

/**
 * Final schematic AST. Traces and standalone `<net>` declarations no longer
 * exist as their own elements — trace endpoints have been consolidated into
 * the connected pin's `connections`, and nets survive only as connection
 * targets (`{ kind: "net", name }`).
 */
export interface SchematicAst {
  chips: Chip[]
  resistors: Resistor[]
  capacitors: Capacitor[]
}
