import { parse } from "./parse"
import type {
  Capacitor,
  Chip,
  ConnectionTarget,
  PinId,
  Resistor,
  SchematicAst,
  SchematicIR,
} from "./types"

type AnyComponent = Chip | Resistor | Capacitor

function cloneComponent<T extends AnyComponent>(c: T): T {
  return { ...c, pins: { ...c.pins }, connections: { ...c.connections } }
}

/**
 * Desugar the IR into the final AST: fold traces into component connections.
 *
 * For a trace `from -> to`, each pin endpoint records the *other* endpoint as
 * the connection on that pin. Net endpoints (which have no pins) are only
 * recorded on the opposing pin.
 */
export function desugar(ir: SchematicIR): SchematicAst {
  const chips = ir.chips.map(cloneComponent)
  const resistors = ir.resistors.map(cloneComponent)
  const capacitors = ir.capacitors.map(cloneComponent)

  const byName = new Map<string, AnyComponent>()
  for (const c of [...chips, ...resistors, ...capacitors]) byName.set(c.name, c)

  const attach = (
    target: ConnectionTarget | undefined,
    other: ConnectionTarget | undefined,
  ) => {
    if (!target || target.kind !== "pin" || !other) return
    const comp = byName.get(target.component)
    if (!comp) return
    comp.connections[target.pin as PinId] = other
  }

  for (const trace of ir.traces) {
    attach(trace.from, trace.to)
    attach(trace.to, trace.from)
  }

  return { chips, resistors, capacitors }
}

/** Parse + desugar in one step: JSX -> final AST. */
export function build(code: string): SchematicAst {
  return desugar(parse(code))
}
